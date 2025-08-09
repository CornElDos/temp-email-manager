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
    const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY;
    const JSONBIN_ID = process.env.JSONBIN_ID;

    if (!JSONBIN_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'JSONBin API key not configured' })
      };
    }

    if (!JSONBIN_ID) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ emails: [] })
      };
    }

    const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: {
        'X-Master-Key': JSONBIN_API_KEY
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ emails: data.record || [] })
      };
    } else {
      throw new Error(`JSONBin responded with ${response.status}`);
    }

  } catch (error) {
    console.error('Error getting emails:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get emails', emails: [] })
    };
  }
};
