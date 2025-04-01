const { Client, Databases, ID, Query } = require('node-appwrite');

// Using the new context-based function signature
module.exports = async function(context) {
  // Extract req and res from context
  const { req, res } = context;
  
  // Initialize Appwrite client
  const client = new Client();
  
  try {
    // Log available context for debugging
    console.log('Function executed with context structure:', Object.keys(context));
    
    // Access environment variables from process.env as requested
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const databaseId = process.env.DATABASE_ID;
    const tokensCollectionId = process.env.TOKENS_COLLECTION_ID;

    console.log('Environment variables:', {
      endpoint: !!endpoint, 
      projectId: !!projectId,
      apiKey: !!apiKey,
      databaseId: !!databaseId,
      tokensCollectionId: !!tokensCollectionId
    });
    
    // Validate required environment variables
    if (!projectId || !apiKey || !databaseId || !tokensCollectionId) {
      return res.json({
        success: false,
        message: 'Missing required environment variables',
        missing: {
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
    
    // Validate payload - check multiple possible locations
    const payload = req.body || req.payload || {};
    console.log('Payload received:', JSON.stringify(payload));
    
    const userId = payload.userId;
    const provider = payload.provider;
    const accessToken = payload.accessToken;
    const refreshToken = payload.refreshToken;
    const expiryDate = payload.expiryDate;
    
    console.log('Payload validation:', {
      hasUserId: !!userId,
      hasProvider: !!provider,
      hasAccessToken: !!accessToken
    });
    
    if (!userId || !provider || !accessToken) {
      return res.json({
        success: false,
        message: 'Missing required fields: userId, provider, and accessToken are required'
      }, 400);
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
      
      console.log(`Token updated for user ${userId}`);
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      );
      
      console.log(`Token created for user ${userId}`);
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
      message: 'Internal server error: ' + error.message
    }, 500);
  }
};