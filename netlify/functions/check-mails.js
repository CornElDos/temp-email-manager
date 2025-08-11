// netlify/functions/check-mails.js - UPPDATERAD för v2
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { email } = JSON.parse(event.body);
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email address required' })
      };
    }

    // Extract username from email (everything before @)
    const emailUser = email.split('@')[0];

    // GraphQL query to fetch all mails for this mailbox
    const query = `
      query CheckInbox {
        inbox(mailbox: "${emailUser}") {
          id
          headerfrom
          subject
          data
          html
          date
        }
      }
    `;

    console.log(`Checking mails for: ${emailUser}`);

    const response = await fetch('https://api.maildrop.cc/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TempEmailManager/2.0'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`Maildrop API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Check for GraphQL errors
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error('GraphQL query failed: ' + result.errors[0].message);
    }

    const mails = result.data?.inbox || [];
    
    console.log(`Found ${mails.length} mails for ${emailUser}`);

    // Return all mails (frontend will handle comparison with existing mails)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: email,
        mails: mails,
        count: mails.length,
        checked_at: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Check mails error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to check mails from Maildrop API'
      })
    };
  }
};
