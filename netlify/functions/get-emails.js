// ===== netlify/functions/get-emails.js (PostgreSQL version) =====
const { Client } = require('pg');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id BIGINT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        verification_code VARCHAR(10),
        status VARCHAR(50) DEFAULT 'waiting',
        used BOOLEAN DEFAULT FALSE,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_checked TIMESTAMP
      )
    `);

    // Get all emails ordered by creation date (newest first)
    const result = await client.query(
      'SELECT * FROM emails ORDER BY created DESC'
    );

    const emails = result.rows.map(row => ({
      id: parseInt(row.id),
      email: row.email,
      password: row.password,
      verificationCode: row.verification_code,
      status: row.status,
      used: row.used,
      created: row.created ? row.created.toLocaleString('sv-SE') : '',
      lastChecked: row.last_checked ? row.last_checked.toLocaleString('sv-SE') : null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ emails })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Database error', 
        emails: [],
        message: error.message 
      })
    };
  } finally {
    await client.end();
  }
};

// ===== netlify/functions/save-emails.js (PostgreSQL version) =====
const { Client } = require('pg');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const client = new Client({
    connectionString: process.env.NETLIFY_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const { emails } = JSON.parse(event.body || '{}');
    
    if (!Array.isArray(emails)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid emails data' })
      };
    }

    await client.connect();

    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id BIGINT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        verification_code VARCHAR(10),
        status VARCHAR(50) DEFAULT 'waiting',
        used BOOLEAN DEFAULT FALSE,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_checked TIMESTAMP
      )
    `);

    // Clear existing data and insert new data
    await client.query('DELETE FROM emails');

    // Insert all emails
    for (const email of emails) {
      await client.query(`
        INSERT INTO emails (id, email, password, verification_code, status, used, created, last_checked)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          password = EXCLUDED.password,
          verification_code = EXCLUDED.verification_code,
          status = EXCLUDED.status,
          used = EXCLUDED.used,
          last_checked = EXCLUDED.last_checked
      `, [
        email.id,
        email.email,
        email.password,
        email.verificationCode || null,
        email.status || 'waiting',
        email.used || false,
        email.created ? new Date(email.created) : new Date(),
        email.lastChecked ? new Date(email.lastChecked) : null
      ]);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Emails saved successfully',
        count: emails.length 
      })
    };

  } catch (error) {
    console.error('Database error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to save emails',
        message: error.message 
      })
    };
  } finally {
    await client.end();
  }
};

// ===== netlify/functions/check-mails.js (PostgreSQL version - same as before, no DB needed) =====
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

// Helper functions for check-mails
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
