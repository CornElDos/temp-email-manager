// netlify/functions/check-mails.js
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
    let email;
    
    // Handle both GET and POST requests
    if (event.httpMethod === 'GET') {
      // GET request: read from query parameters
      email = event.queryStringParameters?.email;
    } else if (event.httpMethod === 'POST') {
      // POST request: read from body
      const body = JSON.parse(event.body || '{}');
      email = body.email;
    }
    
    console.log('Received email:', email);
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email parameter is required' })
      };
    }

    // Extract mailbox name (handle both full email and just username)
    let mailbox;
    if (email.includes('@maildrop.cc')) {
      mailbox = email.split('@')[0];
    } else if (email.includes('@')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Only @maildrop.cc emails are supported' })
      };
    } else {
      // Assume it's just the username
      mailbox = email;
    }
    
    console.log('Checking mailbox:', mailbox);
    
    // Use built-in fetch with simple headers (matching curl example)
    const response = await fetch('https://api.maildrop.cc/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query CheckInbox { inbox(mailbox: "${mailbox}") { id headerfrom subject data html date } }`
      })
    });

    if (!response.ok) {
      console.error('Maildrop API error:', response.status, response.statusText);
      throw new Error(`Maildrop API responded with ${response.status}`);
    }

    const data = await response.json();
    console.log('Maildrop response:', data);
    
    if (data.data && data.data.inbox && data.data.inbox.length > 0) {
      const mails = data.data.inbox;
      
      // Look for verification mails
      for (const mail of mails) {
        if (isVerificationMail(mail)) {
          // Try both data (plaintext) and html fields
          const mailContent = mail.data || mail.html || '';
          const code = extractVerificationCode(mailContent);
          if (code) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                verificationCode: code,
                from: mail.headerfrom, // Changed from mailfrom to headerfrom
                subject: mail.subject 
              })
            };
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ verificationCode: null })
    };

  } catch (error) {
    console.error('Error checking mails:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to check mails',
        details: error.message 
      })
    };
  }
};

// Helper functions
function isVerificationMail(mail) {
  const verificationKeywords = [
    'verify', 'verification', 'confirm', 'activate', 'otp', 'code',
    'bc.game', 'verifiera', 'bekräfta', 'aktivera'
  ];
  
  const subject = (mail.subject || '').toLowerCase();
  const from = (mail.headerfrom || '').toLowerCase(); // Changed from mailfrom
  const content = ((mail.data || mail.html) || '').toLowerCase(); // Use data or html
  
  return verificationKeywords.some(keyword => 
    subject.includes(keyword) || 
    from.includes(keyword) || 
    content.includes(keyword) ||
    from.includes('@bc.game')
  );
}

function extractVerificationCode(content) {
  const codePatterns = [
    /\b(\d{6})\b/g,
    /\b(\d{5})\b/g,
    /\b(\d{4})\b/g,
    /verification code[:\s]*(\d{4,6})/gi,
    /your code[:\s]*(\d{4,6})/gi,
    /otp[:\s]*(\d{4,6})/gi,
    /code[:\s]*(\d{4,6})/gi
  ];

  for (const pattern of codePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const code = match.replace(/\D/g, '');
        if (code.length >= 4 && code.length <= 6) {
          return code;
        }
      }
    }
  }
  return null;
}
