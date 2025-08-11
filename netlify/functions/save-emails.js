// netlify/functions/save-emails.js
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
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

    // Parse request body
    const requestBody = JSON.parse(event.body);
    console.log('Request body:', requestBody);

    // Handle both single email and emails array
    let emailsToSave = [];
    
    if (requestBody.emails && Array.isArray(requestBody.emails)) {
      // Frontend sends { emails: [...] }
      // Only save emails that don't exist in database yet
      emailsToSave = requestBody.emails.map(emailObj => ({
        email: emailObj.email,
        password: emailObj.password,
        used_for: emailObj.used_for || null,
        verification_code: emailObj.verificationCode || null
      }));
    } else if (requestBody.email && requestBody.password) {
      // Direct email save { email: "...", password: "..." }
      emailsToSave = [{
        email: requestBody.email,
        password: requestBody.password,
        used_for: requestBody.used_for || null,
        verification_code: requestBody.verification_code || null
      }];
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and password are required' })
      };
    }

    if (emailsToSave.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No emails to save' })
      };
    }

    // Get existing emails to avoid duplicates
    const { data: existingEmails } = await supabase
      .from('temp_emails')
      .select('email');

    const existingEmailAddresses = (existingEmails || []).map(e => e.email);
    
    // Filter out emails that already exist
    const newEmails = emailsToSave.filter(email => 
      !existingEmailAddresses.includes(email.email)
    );

    if (newEmails.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          saved: 0,
          message: 'No new emails to save (all already exist)'
        })
      };
    }

    // Insert only new emails (no deletion!)
    const { data, error } = await supabase
      .from('temp_emails')
      .insert(newEmails)
      .select();

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        saved: data.length,
        emails: data 
      })
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
