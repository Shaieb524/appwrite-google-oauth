const { Client, Databases, ID, Query } = require('node-appwrite');

module.exports = async function(req, res) {
  // Check if environment variables are available
  // if (!req.variables) {
  //   return res.json({ success: false, message: 'Environment variables not available' }, 500);
  // }

  // Initialize Appwrite with proper error handling
  const client = new Client();
  
  try {
    // Access environment variables safely with fallbacks
    const endpoint = req.variables['APPWRITE_ENDPOINT'] || process.env.APPWRITE_ENDPOINT;
    const projectId = req.variables['APPWRITE_FUNCTION_PROJECT_ID'] || process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const apiKey = req.variables['APPWRITE_API_KEY'] || process.env.APPWRITE_API_KEY;
    const databaseId = req.variables['DATABASE_ID'] || process.env.DATABASE_ID;
    const tokensCollectionId = req.variables['TOKENS_COLLECTION_ID'] || process.env.TOKENS_COLLECTION_ID;
    
    // Validate required environment variables
    if (!endpoint || !projectId || !apiKey || !databaseId || !tokensCollectionId) {
      return res.json({ 
        success: false, 
        message: 'Missing required environment variables',
        missing: {
          endpoint: !endpoint,
          projectId: !projectId,
          apiKey: !apiKey,
          databaseId: !databaseId,
          tokensCollectionId: !tokensCollectionId
        }
      }, 500);
    }
    
    client
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const databases = new Databases(client);
    
    // Validate payload
    const { userId, provider, accessToken, refreshToken, expiryDate } = req.payload || {};
    
    if (!userId || !provider || !accessToken) {
      return res.json({ success: false, message: 'Missing required fields: userId, provider, and accessToken are required' }, 400);
    }
    
    // Check if token record exists
    const records = await databases.listDocuments(
      databaseId,
      tokensCollectionId,
      [
        Query.equal('userId', userId),
        Query.equal('provider', provider)
      ]
    );
    
    if (records.total > 0) {
      // Update existing record
      const record = records.documents[0];
      await databases.updateDocument(
        databaseId,
        tokensCollectionId,
        record.$id,
        {
          accessToken,
          refreshToken: refreshToken || record.refreshToken,
          expiryDate: expiryDate || record.expiryDate,
          updatedAt: new Date().toISOString()
        }
      );
      
      return res.json({ 
        success: true, 
        message: 'Token updated successfully',
        recordId: record.$id 
      });
    } else {
      // Create new record
      const newRecord = await databases.createDocument(
        databaseId,
        tokensCollectionId,
        ID.unique(),
        {
          userId,
          provider,
          accessToken,
          refreshToken: refreshToken || '',
          expiryDate: expiryDate || '',
        }
      );
      
      return res.json({ 
        success: true, 
        message: 'Token created successfully',
        recordId: newRecord.$id 
      });
    }
  } catch (error) {
    console.error('Error in token management function:', error);
    return res.json({ 
      success: false, 
      message: 'Internal server error: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
};