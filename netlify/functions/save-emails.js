import { neon } from '@netlify/neon';

export const handler = async (event, context) => {
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
    
    if (!Array.isArray(emails)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid emails data' })
      };
    }

    const sql = neon(); // automatically uses NETLIFY_DATABASE_URL

    // Create table if it doesn't exist
    await sql`
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
    `;

    // Clear existing data
    await sql`DELETE FROM emails`;

    // Insert all emails
    for (const email of emails) {
      await sql`
        INSERT INTO emails (id, email, password, verification_code, status, used, created, last_checked)
        VALUES (
          ${email.id},
          ${email.email},
          ${email.password},
          ${email.verificationCode || null},
          ${email.status || 'waiting'},
          ${email.used || false},
          ${email.created ? new Date(email.created) : new Date()},
          ${email.lastChecked ? new Date(email.lastChecked) : null}
        )
      `;
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
  }
};
