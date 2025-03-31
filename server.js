// This project consists of several files to handle Google OAuth2 with Appwrite
// with a focus on properly obtaining and storing refresh tokens

// 1. First, let's set up our server.js file (Node.js with Express)
// server.js
const express = require('express');
const { Appwrite, Client, Account, ID } = require('node-appwrite');
const session = require('express-session');
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Initialize Appwrite
const client = new Client();
client
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const account = new Account(client);

// Google OAuth2 configuration
const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: `${process.env.BASE_URL}/auth/google/callback`,
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Initiate Google OAuth flow
app.get('/auth/google', (req, res) => {
  const authUrl = `${googleConfig.authEndpoint}?${querystring.stringify({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUri,
    response_type: 'code',
    scope: 'email profile',
    access_type: 'offline',  // Essential for refresh token
    prompt: 'consent',       // Always show consent screen to ensure refresh token
  })}`;
  
  res.redirect(authUrl);
});

// Handle Google OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post(googleConfig.tokenEndpoint, querystring.stringify({
      code,
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      redirect_uri: googleConfig.redirectUri,
      grant_type: 'authorization_code',
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const { access_token, refresh_token, id_token, expires_in } = tokenResponse.data;
    
    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    const { sub: googleId, email, name } = userInfoResponse.data;
    
    // Calculate token expiry
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);
    
    // Check if user exists in Appwrite
    try {
      // Try to create a JWT session with Account API
      const jwt = await account.createJWT();
      
      // Create a temporary client for the user context
      const userClient = new Client();
      userClient
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setJWT(jwt.jwt);
      
      const userAccount = new Account(userClient);
      
      // Try to create an OAuth2 session
      await userAccount.createSession('oauth2', {
        provider: 'google',
        providerUid: googleId,
        providerAccessToken: access_token,
        providerRefreshToken: refresh_token || '', // Store refresh token if available
        providerAccessTokenExpiry: expiryDate,
        providerTokenId: id_token,
      });
      
      // If successful, store the session in the user's browser
      req.session.user = {
        email,
        name,
        googleId
      };
      
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Appwrite session error:', error);
      
      // If OAuth2 session creation fails, we need to create a user first
      try {
        const newUser = await account.create(
          ID.unique(),
          email,
          undefined, // password is undefined for OAuth users
          name
        );
        
        // Then create the OAuth identity
        await account.createSession('oauth2', {
          provider: 'google',
          providerUid: googleId,
          providerAccessToken: access_token,
          providerRefreshToken: refresh_token || '', // Store refresh token if available
          providerAccessTokenExpiry: expiryDate,
          providerTokenId: id_token,
        });
        
        req.session.user = {
          email,
          name,
          googleId
        };
        
        res.redirect('/dashboard');
      } catch (createError) {
        console.error('User creation error:', createError);
        res.redirect('/error?message=Failed+to+create+user');
      }
    }
  } catch (error) {
    console.error('OAuth token exchange error:', error);
    res.redirect('/error?message=Authentication+failed');
  }
});

// Dashboard route (protected)
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Error route
app.get('/error', (req, res) => {
  res.sendFile(__dirname + '/public/error.html');
});

// Logout route
app.get('/logout', async (req, res) => {
  try {
    // Delete the Appwrite session
    // This would require the sessionId which should be stored
    // when the session is created
    if (req.session.sessionId) {
      await account.deleteSession(req.session.sessionId);
    }
  } catch (error) {
    console.error('Logout error:', error);
  }
  
  // Clear the session
  req.session.destroy();
  res.redirect('/');
});

// Refresh token endpoint 
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken, userId } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  
  try {
    // Exchange refresh token for new access token with Google
    const response = await axios.post(googleConfig.tokenEndpoint, querystring.stringify({
      refresh_token: refreshToken,
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      grant_type: 'refresh_token',
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    const { access_token, expires_in } = response.data;
    
    // Calculate new expiry
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);
    
    // Update the user's tokens in Appwrite
    // This would require a custom API call or function in your Appwrite backend
    // to update the provider tokens
    
    res.json({
      accessToken: access_token,
      expiresAt: expiryDate,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

// Profile API endpoint
app.get('/api/profile', (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Here we would typically fetch more data from Appwrite
    // based on the user's session
    res.json({
      name: req.session.user.name,
      email: req.session.user.email,
      accessToken: 'Stored in Appwrite',
      hasRefreshToken: true, // This would be determined by checking the user's data
      expiresAt: req.session.expiresAt || null
    });
  });
  
// Add a custom endpoint to update tokens in Appwrite
// This would call our Appwrite Function
app.post('/api/update-tokens', async (req, res) => {
const { userId, accessToken, refreshToken, expiryDate } = req.body;

if (!userId || !accessToken) {
    return res.status(400).json({ error: 'Missing required parameters' });
}

try {
    // Call our Appwrite Function to update the tokens
    const response = await axios.post(
    `${process.env.APPWRITE_ENDPOINT}/functions/${process.env.UPDATE_TOKENS_FUNCTION_ID}/executions`,
    {
        userId,
        providerUid: req.session.user.googleId,
        accessToken,
        refreshToken,
        expiryDate
    },
    {
        headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
        'X-Appwrite-Key': process.env.APPWRITE_API_KEY
        }
    }
    );
    
    res.json(response.data);
} catch (error) {
    console.error('Error updating tokens:', error);
    res.status(500).json({ error: 'Failed to update tokens' });
}
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

