const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const { emails } = JSON.parse(event.body || '{}');
    const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
    let JSONBIN_ID = process.env.JSONBIN_ID;

    if (!JSONBIN_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'JSONBin API key not configured' })
      };
    }

    // If no JSONBIN_ID, create new bin
    if (!JSONBIN_ID) {
      const createResponse = await fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': JSONBIN_API_KEY,
          'X-Bin-Name': 'TempEmailManager',
          'X-Bin-Private': 'false'
        },
        body: JSON.stringify(emails || [])
      });

      if (createResponse.ok) {
        const newBin = await createResponse.json();
        JSONBIN_ID = newBin.metadata.id;
        console.log('Created new JSONBin:', JSONBIN_ID);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'New bin created and emails saved',
            binId: JSONBIN_ID 
          })
        };
      } else {
        throw new Error('Failed to create JSONBin');
      }
    }

    // Update existing bin
    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY
      },
      body: JSON.stringify(emails || [])
    });

    if (response.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Emails saved successfully' })
      };
    } else {
      throw new Error(`JSONBin responded with ${response.status}`);
    }

  } catch (error) {
    console.error('Error saving emails:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to save emails' })
    };
  }
};
