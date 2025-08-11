// netlify/functions/get-emails.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    console.log('Supabase URL:', process.env.SUPABASE_URL ? 'Set' : 'Missing');
    console.log('Supabase Key:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing');

    // Get all emails from database
    const { data, error } = await supabase
      .from('temp_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Database error', 
          details: error.message 
        })
      };
    }

    // Map Supabase format to frontend format
    const mappedEmails = (data || []).map(email => ({
      id: email.id,
      email: email.email,
      password: email.password,
      verificationCode: email.verification_code,
      status: email.verification_code ? 'verified' : 'waiting',
      used: !!email.used_for, // Convert used_for to boolean
      created: new Date(email.created_at).toLocaleString('sv-SE'),
      lastChecked: null, // Could be stored separately if needed
      used_for: email.used_for // Keep original for compatibility
    }));

    console.log(`Returning ${mappedEmails.length} emails`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(mappedEmails)
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server error',
        details: error.message 
      })
    };
  }
};
