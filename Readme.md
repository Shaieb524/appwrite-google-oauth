# Google OAuth with Appwrite - Complete Solution

This project demonstrates how to implement Google OAuth2 authentication with Appwrite, ensuring that both access tokens and refresh tokens are properly obtained and stored.

## Overview

The standard Appwrite OAuth2 implementation doesn't capture refresh tokens by default. This project addresses that limitation by:

1. Using a custom OAuth2 flow that explicitly requests offline access
2. Handling the token exchange on the server side
3. Storing both access tokens and refresh tokens in Appwrite
4. Providing functionality to refresh tokens when they expire

## Project Structure

- `server.js` - Main Express server handling the OAuth flow
- `public/` - Frontend files (HTML, CSS, client-side JS)
- `appwrite-function/` - Custom Appwrite function to update tokens
- `.env` - Environment variables configuration

## Prerequisites

- Node.js (v14+)
- npm or yarn
- Appwrite instance (self-hosted or cloud)
- Google Cloud project with OAuth2 credentials

## Setup Instructions

### 1. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Set Application type to "Web application"
6. Add your redirect URI: `http://localhost:3000/auth/google/callback` (or your production URL)
7. Create the client and note your Client ID and Client Secret

### 2. Appwrite Setup

1. Create or access your Appwrite project
2. Set up a database and collection for storing extended user data (optional but recommended)
3. Create a new Appwrite API key with the necessary permissions
4. Create a new Appwrite Function based on the code in `appwrite-custom-api.js`

### 3. Project Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file using the template provided
4. Fill in all required environment variables:
   - Server configuration
   - Appwrite credentials
   - Google OAuth credentials
   - Database information

### 4. Running the Project

1. Start the server:
   ```
   npm start
   ```
2. Open your browser to `http://localhost:3000`
3. Click "Sign in with Google" to test the authentication flow

## How It Works

1. **Authentication Flow**:
   - User clicks "Sign in with Google"
   - They're redirected to Google's consent screen
   - After approval, Google redirects back with an authorization code
   - The server exchanges this code for tokens (including refresh token)
   - The tokens are stored in Appwrite
   - User is redirected to the dashboard

2. **Token Storage**:
   - Access tokens are stored in Appwrite user identities
   - Refresh tokens are also stored for future use
   - Token expiry is tracked to know when to refresh

3. **Token Refresh**:
   - When an access token expires, the refresh token is used to get a new one
   - The custom Appwrite function updates the stored tokens

## Customization

You can extend this project by:

- Adding more OAuth providers
- Implementing additional user profile data storage
- Creating more complex authorization rules
- Building out the frontend dashboard

## Troubleshooting

- **Missing Refresh Token**: Ensure `access_type=offline` and `prompt=consent` are included in the authorization URL
- **Authorization Errors**: Check your Google Cloud Console settings and verify your redirect URI
- **Appwrite Errors**: Verify your API keys and endpoint settings

## Security Considerations

- Never expose your client secret or API keys in client-side code
- Use HTTPS in production
- Set secure cookie settings in production
- Consider implementing CSRF protection
- Regularly rotate your API keys and client secrets

## Resources

- [Appwrite Documentation](https://appwrite.io/docs)
- [Google OAuth2 Documentation](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Express.js Documentation](https://expressjs.com/)