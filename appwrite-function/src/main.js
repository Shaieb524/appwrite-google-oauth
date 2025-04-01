const { Client, Databases, ID, Query } = require('node-appwrite');

module.exports = async function(req, res) {
  // Initialize Appwrite
  const client = new Client();
  client
    .setEndpoint(req.env.APPWRITE_ENDPOINT) // Adjust if self-hosting
    .setProject(req.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  
  try {
    const { userId, provider, accessToken, refreshToken, expiryDate } = req.payload;
    
    if (!userId || !provider || !accessToken) {
      return res.json({ success: false, message: 'Missing required fields' }, 400);
    }
    
    // Check if token record exists
    const records = await databases.listDocuments(
      req.env.DATABASE_ID,
      req.env.TOKENS_COLLECTION_ID,
      [
        Query.equal('userId', userId),
        Query.equal('provider', provider)
      ]
    );
    
    if (records.total > 0) {
      // Update existing record
      const record = records.documents[0];
      await databases.updateDocument(
        req.env.DATABASE_ID,
        req.env.TOKENS_COLLECTION_ID,
        record.$id,
        {
          accessToken,
          refreshToken: refreshToken || record.refreshToken,
          expiryDate: expiryDate || record.expiryDate
        }
      );
      
      return res.json({ success: true, message: 'Token updated' });
    } else {
      // Create new record
      await databases.createDocument(
        req.env.DATABASE_ID,
        req.env.TOKENS_COLLECTION_ID,
        ID.unique(),
        {
          userId,
          provider,
          accessToken,
          refreshToken: refreshToken || '',
          expiryDate: expiryDate || ''
        }
      );
      
      return res.json({ success: true, message: 'Token created' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.json({ success: false, message: error.message }, 500);
  }
};