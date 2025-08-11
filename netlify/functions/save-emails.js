// netlify/functions/save-emails.js - För ditt befintliga schema
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { emails } = JSON.parse(event.body);

    if (!Array.isArray(emails)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid data format' })
      };
    }

    console.log(`Attempting to save ${emails.length} emails`);

    // Clear existing data
    const { error: deleteError } = await supabase
      .from('temp_emails')
      .delete()
      .neq('id', 0);

    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('Delete error:', deleteError);
    }

    // Compress and prepare emails data
    const compressedEmails = emails.map(email => {
      let mails = [];
      
      if (email.mails && email.mails.length > 0) {
        mails = email.mails.slice(0, 10).map(mail => ({
          id: mail.id,
          headerfrom: mail.headerfrom,
          subject: mail.subject,
          date: mail.date,
          data: mail.data ? mail.data.substring(0, 500) + (mail.data.length > 500 ? '...' : '') : '',
          html: mail.html ? mail.html.substring(0, 500) + (mail.html.length > 500 ? '...' : '') : '',
          truncated: (mail.data && mail.data.length > 500) || (mail.html && mail.html.length > 500)
        }));
      }
      
      return {
        ...email,
        mails: mails
      };
    });

    // Insert data in batches
    const batchSize = 50;
    let savedCount = 0;
    
    for (let i = 0; i < compressedEmails.length; i += batchSize) {
      const batch = compressedEmails.slice(i, i + batchSize);
      
      const insertData = batch.map(email => ({
        email: email.email,
        password: email.password,
        status: email.status || 'waiting',
        used: email.used || false,
        mails: JSON.stringify(email.mails || []),
        last_checked: email.lastChecked,
        verification_code: email.verificationCode,
        used_for: email.used ? 'marked_used' : null,
        created_at: email.created ? new Date(email.created) : new Date()
      }));

      const { error: insertError } = await supabase
        .from('temp_emails')
        .insert(insertData);

      if (insertError) {
        console.error('Insert error for batch:', insertError);
        throw insertError;
      }
      
      savedCount += batch.length;
    }

    console.log(`Successfully saved ${savedCount} emails`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        saved: savedCount,
        message: 'Emails saved successfully'
      })
    };

  } catch (error) {
    console.error('Save emails error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to save emails to database'
      })
    };
  }
};
