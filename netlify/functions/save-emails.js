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

    // Clear existing emails and insert new ones
    // First, delete all existing emails
    const { error: deleteError } = await supabase
      .from('temp_emails')
      .delete()
      .neq('id', 0); // Delete all rows

    if (deleteError) {
      console.error('Delete error:', deleteError);
    }

    // Insert new emails
    const { data, error } = await supabase
      .from('temp_emails')
      .insert(emailsToSave)
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
