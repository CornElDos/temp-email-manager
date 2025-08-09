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

    // Get all emails ordered by creation date (newest first)
    const emails = await sql`
      SELECT * FROM emails ORDER BY created DESC
    `;

    const formattedEmails = emails.map(row => ({
      id: parseInt(row.id),
      email: row.email,
      password: row.password,
      verificationCode: row.verification_code,
      status: row.status,
      used: row.used,
      created: row.created ? new Date(row.created).toLocaleString('sv-SE') : '',
      lastChecked: row.last_checked ? new Date(row.last_checked).toLocaleString('sv-SE') : null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ emails: formattedEmails })
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
  }
};
