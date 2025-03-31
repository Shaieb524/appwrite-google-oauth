const { Client, Databases, Query, ID } = require('node-appwrite');

// This is an Appwrite Cloud Function that handles token refresh and updates
module.exports = async function(req, res) {
  // Initialize Appwrite
  const client = new Client();

  // `req.env` contains environment variables set in the Appwrite Console
  client
    .setEndpoint(req.env.APPWRITE_ENDPOINT)
    .setProject(req.env.APPWRITE_PROJECT_ID)
    .setKey(req.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  try {
    // Get parameters from the request
    const { userId, providerUid, accessToken, refreshToken, expiryDate } = req.body;

    if (!userId || !providerUid || !accessToken) {
      return res.json({ success: false, message: 'Missing required parameters' }, 400);
    }

    // Get the user's identity document
    // Assuming we have a database collection for extended user data
    // If you're using Appwrite's built-in users, you may need a different approach
    const identities = await databases.listDocuments(
      req.env.DATABASE_ID,
      req.env.IDENTITIES_COLLECTION_ID,
      [
        Query.equal('userId', userId),
        Query.equal('providerUid', providerUid),
        Query.equal('provider', 'google')
      ]
    );

    if (identities.documents.length === 0) {
      // Create a new identity document if none exists
      await databases.createDocument(
        req.env.DATABASE_ID,
        req.env.IDENTITIES_COLLECTION_ID,
        ID.unique(),
        {
          userId,
          provider: 'google',
          providerUid,
          providerAccessToken: accessToken,
          providerRefreshToken: refreshToken || '',
          providerAccessTokenExpiry: expiryDate,
        }
      );
    } else {
      // Update the existing identity document
      const identity = identities.documents[0];
      
      await databases.updateDocument(
        req.env.DATABASE_ID,
        req.env.IDENTITIES_COLLECTION_ID,
        identity.$id,
        {
          providerAccessToken: accessToken,
          providerRefreshToken: refreshToken || identity.providerRefreshToken || '',
          providerAccessTokenExpiry: expiryDate,
        }
      );
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating tokens:', error);
    return res.json({ success: false, message: error.message }, 500);
  }
};