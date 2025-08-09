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
    const { email } = JSON.parse(event.body || '{}');
    
    if (!email || !email.includes('@maildrop.cc')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid email address' })
      };
    }

    const mailbox = email.split('@')[0];
    
    const response = await fetch('https://api.maildrop.cc/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { inbox(mailbox: "${mailbox}") { id mailfrom subject body } }`
      })
    });

    if (!response.ok) {
      throw new Error(`Maildrop API responded with ${response.status}`);
    }

    const data = await response.json();
    
    if (data.data && data.data.inbox && data.data.inbox.length > 0) {
      const mails = data.data.inbox;
      
      // Look for verification mails
      for (const mail of mails) {
        if (isVerificationMail(mail)) {
          const code = extractVerificationCode(mail.body);
          if (code) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ 
                verificationCode: code,
                from: mail.mailfrom,
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
      body: JSON.stringify({ error: 'Failed to check mails' })
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
  const from = (mail.mailfrom || '').toLowerCase();
  const body = (mail.body || '').toLowerCase();
  
  return verificationKeywords.some(keyword => 
    subject.includes(keyword) || 
    from.includes(keyword) || 
    body.includes(keyword) ||
    from.includes('@bc.game')
  );
}

function extractVerificationCode(body) {
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
    const matches = body.match(pattern);
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
