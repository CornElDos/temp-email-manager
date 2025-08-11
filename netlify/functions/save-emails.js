// netlify/functions/save-emails.js - UPPDATERAD för v2
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

    // Compress emails data - remove large HTML content for storage
    const compressedEmails = emails.map(email => {
      const compressed = { ...email };
      
      // Store mails separately or compress them
      if (email.mails && email.mails.length > 0) {
        compressed.mails = email.mails.map(mail => ({
          id: mail.id,
          headerfrom: mail.headerfrom,
          subject: mail.subject,
          date: mail.date,
          // Store only first 500 chars of data and html to save space
          data: mail.data ? mail.data.substring(0, 500) + (mail.data.length > 500 ? '...' : '') : '',
          html: mail.html ? mail.html.substring(0, 500) + (mail.html.length > 500 ? '...' : '') : '',
          // Add flag to indicate if content was truncated
          truncated: (mail.data && mail.data.length > 500) || (mail.html && mail.html.length > 500)
        }));
        
        // Limit to max 10 mails per email to prevent huge payloads
        if (compressed.mails.length > 10) {
          compressed.mails = compressed.mails.slice(0, 10);
        }
      }
      
      return compressed;
    });

    // First, clear existing data
    const { error: deleteError } = await supabase
      .from('temp_emails')
      .delete()
      .neq('id', 0); // Delete all records

    if (deleteError && deleteError.code !== 'PGRST116') { // PGRST116 = no rows found, which is OK
      console.error('Delete error:', deleteError);
    }

    // Insert new data in batches to avoid size limits
    const batchSize = 50; // Process 50 emails at a time
    const batches = [];
    
    for (let i = 0; i < compressedEmails.length; i += batchSize) {
      batches.push(compressedEmails.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const { error: insertError } = await supabase
        .from('temp_emails')
        .insert(
          batch.map(email => ({
            email_id: email.id,
            email_address: email.email,
            password: email.password,
            mails: JSON.stringify(email.mails || []),
            status: email.status,
            used: email.used,
            created: email.created,
            last_checked: email.lastChecked
          }))
        );

      if (insertError) {
        console.error('Insert error for batch:', insertError);
        throw insertError;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        saved: compressedEmails.length,
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
