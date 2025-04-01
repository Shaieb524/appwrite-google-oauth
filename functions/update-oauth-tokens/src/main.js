const { Client, Databases, ID, Query } = require('node-appwrite');

// Using the new context-based function signature
module.exports = async function(context) {
  // Initialize Appwrite client
  const client = new Client();
  
  try {
    // Log available context for debugging
    context.log('Function executed with context structure:', Object.keys(context));
    
    // Access environment variables from context.env
    const endpoint = context.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
    const projectId = context.env.APPWRITE_FUNCTION_PROJECT_ID;
    const apiKey = context.env.APPWRITE_API_KEY;
    const databaseId = context.env.DATABASE_ID;
    const tokensCollectionId = context.env.TOKENS_COLLECTION_ID;
    
    // Log environment variable status
    context.log('Environment variables status:', {
      hasEndpoint: !!endpoint,
      hasProjectId: !!projectId,
      hasApiKey: !!apiKey,
      hasDatabaseId: !!databaseId,
      hasTokensCollectionId: !!tokensCollectionId
    });
    
    // Validate required environment variables
    if (!projectId || !apiKey || !databaseId || !tokensCollectionId) {
      return context.json({
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
    
    // Validate payload (in new API, it's in context.body)
    const payload = context.body || {};
    const userId = payload.userId;
    const provider = payload.provider;
    const accessToken = payload.accessToken;
    const refreshToken = payload.refreshToken;
    const expiryDate = payload.expiryDate;
    
    context.log('Payload validation:', {
      hasUserId: !!userId,
      hasProvider: !!provider,
      hasAccessToken: !!accessToken
    });
    
    if (!userId || !provider || !accessToken) {
      return context.json({
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
      
      context.log(`Token updated for user ${userId}`);
      return context.json({
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
      
      context.log(`Token created for user ${userId}`);
      return context.json({
        success: true,
        message: 'Token created successfully',
        recordId: newRecord.$id
      });
    }
  } catch (error) {
    context.error('Error in token management function:', error);
    return context.json({
      success: false,
      message: 'Internal server error: ' + error.message
    }, 500);
  }
};