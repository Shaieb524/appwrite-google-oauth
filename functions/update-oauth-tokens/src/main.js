const { Client, Databases, ID, Query } = require('node-appwrite');

// Using the new context-based function signature
module.exports = async function(context) {
  // Extract req and res from context
  const { req, res } = context;
  
  // Initialize Appwrite client
  const client = new Client();
  
  try {
    // ENHANCED DEBUGGING - Start
    // Log more details about the request
    console.log('Request details:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
    });
    
    // Try different ways to access the payload
    console.log('req.payload:', req.payload);
    console.log('req.body:', req.body);
    console.log('context.req?.payload:', context.req?.payload);
    console.log('context.req?.body:', context.req?.body);
    console.log('Raw body (if available):', req.rawBody || 'Not available');
    
    // Try to access the data field which is commonly used in Appwrite functions
    if (req.data) {
      console.log('req.data:', req.data);
      try {
        const parsedData = typeof req.data === 'string' ? JSON.parse(req.data) : req.data;
        console.log('Parsed data:', parsedData);
      } catch (e) {
        console.log('Error parsing req.data:', e.message);
      }
    }
    
    // Check if data is in the body string
    if (typeof req.body === 'string') {
      try {
        console.log('Attempting to parse req.body string:', req.body);
        const parsedBody = JSON.parse(req.body);
        console.log('Parsed body string:', parsedBody);
        
        // If we have a data field, try to parse that too
        if (parsedBody.data && typeof parsedBody.data === 'string') {
          try {
            const parsedData = JSON.parse(parsedBody.data);
            console.log('Parsed data from body.data:', parsedData);
          } catch (e) {
            console.log('Error parsing body.data:', e.message);
          }
        }
      } catch (e) {
        console.log('Error parsing req.body string:', e.message);
      }
    }
    // ENHANCED DEBUGGING - End
    
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
    
    // UPDATED PAYLOAD EXTRACTION - Start
    // Try to get the payload from multiple possible locations
    let effectivePayload = {};
    
    // Check req.body or req.payload first (original approach)
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Using req.body as payload');
      effectivePayload = req.body;
    } else if (req.payload && Object.keys(req.payload).length > 0) {
      console.log('Using req.payload as payload');
      effectivePayload = req.payload;
    } 
    // Check if we have a string in req.body that needs parsing
    else if (typeof req.body === 'string' && req.body.trim() !== '') {
      try {
        const parsedBody = JSON.parse(req.body);
        console.log('Using parsed req.body string as payload');
        
        // If we have a data field that's a string, parse that too (Appwrite format)
        if (parsedBody.data && typeof parsedBody.data === 'string') {
          try {
            effectivePayload = JSON.parse(parsedBody.data);
            console.log('Using parsed req.body.data as payload');
          } catch (e) {
            effectivePayload = parsedBody;
          }
        } else {
          effectivePayload = parsedBody;
        }
      } catch (e) {
        console.log('Error parsing req.body string, using empty payload');
      }
    }
    // Check if we have req.data available (common in Appwrite)
    else if (req.data) {
      if (typeof req.data === 'string') {
        try {
          effectivePayload = JSON.parse(req.data);
          console.log('Using parsed req.data as payload');
        } catch (e) {
          console.log('Error parsing req.data string, using as-is');
          effectivePayload = { rawData: req.data };
        }
      } else {
        console.log('Using req.data object as payload');
        effectivePayload = req.data;
      }
    }
    
    console.log('Final effective payload:', JSON.stringify(effectivePayload));
    // UPDATED PAYLOAD EXTRACTION - End
    
    // Extract fields from the effective payload
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