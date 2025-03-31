// server.js - Fixed version
const express = require('express');
const { Client, Users, ID } = require('node-appwrite');
const session = require('express-session');
const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
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

const users = new Users(client);

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
    
    // Log tokens for debugging (REMOVE IN PRODUCTION)
    console.log("\n==== GOOGLE OAUTH TOKENS ====");
    console.log("Access Token:", access_token);
    console.log("Refresh Token:", refresh_token);
    console.log("ID Token:", id_token);
    console.log("Expires In:", expires_in);
    console.log("=============================\n");
    
    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    const { sub: googleId, email, name } = userInfoResponse.data;
    
    // Calculate token expiry
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);
    
    try {
      // Try to find user by email - custom implementation since we don't have JWT
      let user;
      try {
        // List users with the given email
        const usersList = await users.list([`email=${email}`]);
        
        if (usersList.total > 0) {
          // User exists
          user = usersList.users[0];
        } else {
          // Create a new user
          // Store OAuth tokens in user preferences or a separate collection
          user = await users.create(
            ID.unique(),
            email,
            null,  // Phone (optional)
            null,  // Pass null for password with OAuth users
            name   // Name
          );
          
          console.log("Created new user:", user.$id);
        }
        
        // Store Google OAuth information in user metadata or a separate collection
        // This might require setting up a database collection for extended user data
        
        // For simplicity, store tokens in session
        req.session.user = {
          userId: user.$id,
          email,
          name,
          googleId,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: expiryDate.toISOString()
        };
        
        res.redirect('/dashboard');
      } catch (listError) {
        console.error('Error listing users:', listError);
        throw listError;
      }
    } catch (error) {
      console.error('User operation error:', error);
      
      // Fallback approach: store tokens in session only
      req.session.user = {
        email,
        name,
        googleId,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expiryDate.toISOString()
      };
      
      res.redirect('/dashboard?tokenOnly=true');
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
  // Clear the session
  req.session.destroy();
  res.redirect('/');
});

// Profile API endpoint
app.get('/api/profile', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    name: req.session.user.name,
    email: req.session.user.email,
    accessToken: req.session.user.accessToken ? 'Available' : 'None',
    hasRefreshToken: !!req.session.user.refreshToken,
    expiresAt: req.session.user.expiresAt || null
  });
});

// Token debug endpoint (REMOVE IN PRODUCTION)
app.get('/api/tokens', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    accessToken: req.session.user.accessToken,
    refreshToken: req.session.user.refreshToken,
    expiresAt: req.session.user.expiresAt
  });
});

// Refresh token endpoint 
app.post('/api/refresh', async (req, res) => {
  if (!req.session.user || !req.session.user.refreshToken) {
    return res.status(401).json({ error: 'No refresh token available' });
  }
  
  const refreshToken = req.session.user.refreshToken;
  
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
    
    // Update session
    req.session.user.accessToken = access_token;
    req.session.user.expiresAt = expiryDate.toISOString();
    
    res.json({
      success: true,
      accessToken: 'Updated',
      expiresAt: expiryDate
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});