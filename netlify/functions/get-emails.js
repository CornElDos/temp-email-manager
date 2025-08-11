// netlify/functions/get-emails.js - UPPDATERAD för v2
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
    const { data, error } = await supabase
      .from('temp_emails')
      .select('*')
      .order('created', { ascending: false });

    if (error) {
      throw error;
    }

    // Convert database format back to app format
    const emails = (data || []).map(record => ({
      id: record.email_id,
      email: record.email_address,
      password: record.password,
      mails: record.mails ? JSON.parse(record.mails) : [],
      status: record.status,
      used: record.used,
      created: record.created,
      lastChecked: record.last_checked
    }));

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
