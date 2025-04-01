const { Client, Databases, ID, Query } = require('node-appwrite');

module.exports = async function(context) {
  // Extract req and res from context
  const { req, res } = context;
  
  // Initialize Appwrite client
  const client = new Client();
  
  try {
    console.log('Function starting execution');
    
    // Access environment variables
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    const databaseId = process.env.DATABASE_ID;
    const tokensCollectionId = process.env.TOKENS_COLLECTION_ID;
    
    // Validate required environment variables
    if (!projectId || !apiKey || !databaseId || !tokensCollectionId) {
      return res.json({
        success: false,
        message: 'Missing required environment variables'
      }, 500);
    }
    
    client
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const databases = new Databases(client);
    
    // Get payload from req.body
    let effectivePayload = {};
    
    // Handle the case where req.body is a string that might be JSON
    if (typeof req.body === 'string') {
      try {
        // Parse the string as JSON
        effectivePayload = JSON.parse(req.body);
        console.log('Parsed string body into JSON object');
      } catch (e) {
        console.error('Error parsing req.body as JSON:', e.message);
      }
    } 
    // Handle the case where req.body is already an object
    else if (req.body && typeof req.body === 'object') {
      effectivePayload = req.body;
      console.log('Using req.body as object directly');
    }
    
    console.log('Initial payload:', effectivePayload);
    
    // Check if the effectivePayload is itself a stringified JSON
    // This happens when SDK sends JSON stringified twice
    if (typeof effectivePayload === 'string') {
      try {
        effectivePayload = JSON.parse(effectivePayload);
        console.log('Parsed double-stringified JSON payload');
      } catch (e) {
        console.error('Error parsing stringified payload:', e.message);
      }
    }
    
    console.log('Final effective payload:', effectivePayload);
    
    // Extract fields from the payload
    const userId = effectivePayload.userId;
    const provider = effectivePayload.provider;
    const accessToken = effectivePayload.accessToken;
    const refreshToken = effectivePayload.refreshToken;
    const expiryDate = effectivePayload.expiryDate;
    
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