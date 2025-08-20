// netlify/functions/check-mails.js - Gmail API integration för mailboxes.live
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

    // Validate that this is a mailboxes.live email
    if (!email.endsWith('@mailboxes.live')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Only @mailboxes.live emails supported' })
      };
    }

    console.log(`Checking Gmail for emails sent to: ${email}`);

    // Get fresh access token
    const accessToken = await getGmailAccessToken();

    // 🔥 UPPDATERING: Sök i ALLA mappar inkl. Spam med tidsfilter
    const searchQuery = `to:${email} newer_than:48h`;
    
    console.log(`🔍 Gmail search query: ${searchQuery}`);
    
    // 🔥 UPPDATERING: Inkludera includeSpamTrash för att få spam-mails
    const searchResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=50&includeSpamTrash=true`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`Gmail search API error: ${searchResponse.status} ${searchResponse.statusText}`);
    }

    const searchResult = await searchResponse.json();
    const messages = searchResult.messages || [];

    console.log(`📧 Found ${messages.length} messages for ${email} (inkl. alla mappar)`);

    if (messages.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          email: email,
          mails: [],
          count: 0,
          checked_at: new Date().toISOString(),
          debug: 'No messages found in any folder (inbox, spam, promotions, etc.)'
        })
      };
    }

    // 🔥 UPPDATERING: Öka från 3 till 10 meddelanden för bättre täckning
    const mails = [];
    const batchSize = 3;
    const maxMessages = Math.min(messages.length, 10); // Ökat från 3 till 10

    for (let i = 0; i < maxMessages; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (message) => {
        try {
          const messageResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!messageResponse.ok) {
            console.error(`Failed to fetch message ${message.id}: ${messageResponse.status}`);
            return null;
          }

          const messageData = await messageResponse.json();
          return parseGmailMessage(messageData, email);
        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      mails.push(...batchResults.filter(mail => mail !== null));

      // Rate limiting - wait between batches
      if (i + batchSize < maxMessages) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Sort by date (newest first)
    mails.sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log(`✅ Successfully processed ${mails.length} mails for ${email}`);

    // 🔥 UPPDATERING: Debug-info om vilka mappar som hittades
    if (mails.length > 0) {
      console.log('📂 Mail folder distribution:');
      mails.forEach(mail => {
        console.log(`  - ${mail.subject} (${mail.folder || 'unknown folder'})`);
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: email,
        mails: mails,
        count: mails.length,
        checked_at: new Date().toISOString(),
        debug: {
          total_found: messages.length,
          processed: mails.length,
          search_query: searchQuery,
          includes_spam: true
        }
      })
    };

  } catch (error) {
    console.error('Check mails error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to check mails from Gmail API'
      })
    };
  }
};

// Get fresh access token using refresh token
async function getGmailAccessToken() {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing Gmail API credentials in environment variables');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to refresh Gmail token: ${response.status} ${errorData}`);
  }

  const tokenData = await response.json();
  
  if (!tokenData.access_token) {
    throw new Error('No access token received from Google');
  }

  return tokenData.access_token;
}

// 🔥 UPPDATERING: Parse Gmail message med folder-info
function parseGmailMessage(messageData, targetEmail) {
  try {
    const headers = messageData.payload.headers || [];
    
    // Extract headers
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    const subject = getHeader('Subject');
    const from = getHeader('From');
    const to = getHeader('To');
    const date = getHeader('Date');

    // Only include emails actually sent to our target address
    if (!to.includes(targetEmail)) {
      return null;
    }

    // 🔥 UPPDATERING: Identifiera vilken mapp mailet ligger i
    const labels = messageData.labelIds || [];
    let folder = 'inbox'; // default
    
    if (labels.includes('SPAM')) {
      folder = 'spam';
    } else if (labels.includes('CATEGORY_PROMOTIONS')) {
      folder = 'promotions';
    } else if (labels.includes('CATEGORY_UPDATES')) {
      folder = 'updates';
    } else if (labels.includes('CATEGORY_SOCIAL')) {
      folder = 'social';
    } else if (labels.includes('TRASH')) {
      folder = 'trash';
    }

    // 🔥 UPPDATERING: Logga folder-info för debug
    console.log(`📧 ${subject} från ${from} → FOLDER: ${folder} (labels: ${labels.join(', ')})`);

    // Extract message body
    const { textContent, htmlContent } = extractMessageContent(messageData.payload);

    // Create unique ID based on Gmail message ID and our format
    const mailId = `gmail-${messageData.id}`;

    // Convert date to ISO format
    let parsedDate;
    try {
      parsedDate = new Date(date).toISOString();
    } catch (e) {
      parsedDate = new Date().toISOString();
    }

    return {
      id: mailId,
      headerfrom: from,
      subject: subject,
      data: textContent || '',
      html: htmlContent || '',
      date: parsedDate,
      to: to,
      messageId: messageData.id,
      threadId: messageData.threadId,
      source: 'gmail',
      folder: folder,           // 🔥 NYTT: Folder-info
      labels: labels            // 🔥 NYTT: Alla Gmail labels
    };

  } catch (error) {
    console.error('Error parsing Gmail message:', error);
    return null;
  }
}

// Extract text and HTML content from Gmail message payload
function extractMessageContent(payload) {
  let textContent = '';
  let htmlContent = '';

  function extractFromPart(part) {
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      textContent += base64UrlDecode(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      htmlContent += base64UrlDecode(part.body.data);
    } else if (part.parts && part.parts.length > 0) {
      // Recursively process multipart messages
      part.parts.forEach(extractFromPart);
    }
  }

  if (payload.body && payload.body.data) {
    // Simple message with body data
    if (payload.mimeType === 'text/plain') {
      textContent = base64UrlDecode(payload.body.data);
    } else if (payload.mimeType === 'text/html') {
      htmlContent = base64UrlDecode(payload.body.data);
    }
  } else if (payload.parts) {
    // Multipart message
    payload.parts.forEach(extractFromPart);
  }

  return { textContent, htmlContent };
}

// Decode base64url encoded content from Gmail
function base64UrlDecode(str) {
  try {
    // Replace URL-safe characters and add padding if needed
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
      str += '=';
    }
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Error decoding base64url:', error);
    return '';
  }
}
