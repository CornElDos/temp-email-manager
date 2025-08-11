// netlify/functions/get-emails.js - För ditt befintliga schema
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Fetching emails from database...');

    const { data, error } = await supabase
      .from('temp_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log(`Retrieved ${data ? data.length : 0} records from database`);

    // Convert database format to app format
    const emails = (data || []).map(record => {
      const email = {
        id: record.id, // Use the actual database ID
        email: record.email,
        password: record.password,
        status: record.status || 'waiting',
        used: record.used || false,
        created: new Date(record.created_at).toLocaleString('sv-SE'),
        lastChecked: record.last_checked
      };

      // Handle mails data
      if (record.mails) {
        try {
          email.mails = typeof record.mails === 'string' ? JSON.parse(record.mails) : record.mails;
        } catch (e) {
          console.error('Error parsing mails JSON:', e);
          email.mails = [];
        }
      } else {
        email.mails = [];
      }

      // Handle legacy verification code
      if (record.verification_code && email.mails.length === 0) {
        email.verificationCode = record.verification_code;
        // Create a synthetic mail for legacy verification codes
        email.mails.push({
          id: 'legacy-' + record.id,
          subject: 'Verification Code',
          data: `Your verification code: ${record.verification_code}`,
          headerfrom: 'System Generated',
          date: record.created_at,
          html: `<p>Your verification code: <strong>${record.verification_code}</strong></p>`
        });
        email.status = 'verified';
      }

      return email;
    });

    console.log(`Converted ${emails.length} emails for frontend`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(emails)
    };

  } catch (error) {
    console.error('Get emails error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to fetch emails from database'
      })
    };
  }
};
