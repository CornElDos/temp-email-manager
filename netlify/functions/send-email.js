// netlify/functions/send-email.js - Resend integration
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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
    const { email, type = 'welcome' } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email address required' })
      };
    }

    // Generate verification code (6 digits for gambling sites)
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    
    // Generate verification link
    const verificationLink = `https://verify-account.example.com/confirm?code=${verificationCode}&email=${encodeURIComponent(email)}`;

    // Professional email templates
    const templates = {
      welcome: {
        subject: 'Bekräfta din registrering',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0; font-size: 28px;">🎯 Bekräfta ditt konto</h1>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Välkommen!</h2>
              
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Din registrering är nästan klar. För att aktivera ditt konto, använd verifieringskoden nedan:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 10px; letter-spacing: 3px; display: inline-block;">
                  ${verificationCode}
                </div>
              </div>
              
              <p style="color: #666; font-size: 14px; text-align: center;">
                Eller klicka på länken nedan för automatisk verifiering:
              </p>
              
              <div style="text-align: center; margin: 20px 0;">
                <a href="${verificationLink}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                  Bekräfta konto automatiskt
                </a>
              </div>
              
              <div style="border-top: 1px solid #dee2e6; margin-top: 30px; padding-top: 20px;">
                <p style="color: #999; font-size: 12px; margin: 0;">
                  <strong>Viktigt:</strong> Denna kod är giltig i 10 minuter.<br>
                  Om du inte har begärt denna verifiering, ignorera detta meddelande.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 20px;">
                <p style="color: #999; font-size: 11px; margin: 0;">
                  Säker verifiering • Automatiskt genererat meddelande
                </p>
              </div>
            </div>
          </div>
        `
      },
      
      gaming: {
        subject: 'Verifiera ditt spelkonto - Säker inloggning',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;">
            <div style="background: linear-gradient(135deg, #16213e 0%, #0f3460 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0; font-size: 28px;">🎮 Kontoverifiering</h1>
            </div>
            
            <div style="background: #eee; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Säkra din spelupplevelse</h2>
              
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                För att slutföra din registrering och börja spela säkert, bekräfta ditt konto med koden nedan:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <div style="background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%); color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 10px; letter-spacing: 3px; display: inline-block; box-shadow: 0 4px 15px rgba(255,107,107,0.3);">
                  ${verificationCode}
                </div>
              </div>
              
              <p style="color: #666; font-size: 14px; text-align: center;">
                Alternativt, klicka här för snabb verifiering:
              </p>
              
              <div style="text-align: center; margin: 20px 0;">
                <a href="${verificationLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block; box-shadow: 0 4px 15px rgba(102,126,234,0.3);">
                  ⚡ Snabbverifiering
                </a>
              </div>
              
              <div style="background: #d1ecf1; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <p style="color: #0c5460; margin: 0; font-size: 14px;">
                  <strong>🔒 Säkerhetspåminnelse:</strong> Vi skickar aldrig mejl som ber om lösenord eller känslig information.
                </p>
              </div>
              
              <div style="border-top: 1px solid #dee2e6; margin-top: 30px; padding-top: 20px;">
                <p style="color: #999; font-size: 12px; margin: 0;">
                  Verifieringskod giltig i 15 minuter • Skickad automatiskt vid kontoregistrering<br>
                  Kontakta support om du upplever problem med verifieringen.
                </p>
              </div>
            </div>
          </div>
        `
      }
    };

    const template = templates[type] || templates.welcome;

    // Send email via Resend
    console.log('Attempting to send email with Resend...');
    console.log('From: onboarding@resend.dev');
    console.log('To:', email);
    console.log('API Key present:', !!process.env.RESEND_API_KEY);
    console.log('API Key starts with re_:', process.env.RESEND_API_KEY?.startsWith('re_'));
    
    let result;
    try {
      result = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: template.subject,
        html: template.html
      });
      
      console.log('Resend API Response (full):', JSON.stringify(result, null, 2));
      console.log('Result type:', typeof result);
      console.log('Result keys:', result ? Object.keys(result) : 'null/undefined');
      
    } catch (resendError) {
      console.error('Resend API Error:', resendError);
      console.error('Error type:', typeof resendError);
      console.error('Error message:', resendError.message);
      console.error('Error stack:', resendError.stack);
      
      throw new Error(`Resend API error: ${resendError.message}`);
    }

    // Check if Resend actually succeeded
    if (!result) {
      throw new Error('Resend API returned null/undefined');
    }
    
    if (result.error) {
      throw new Error(`Resend API error: ${result.error.message || result.error}`);
    }
    
    if (!result.id && !result.data?.id) {
      console.log('No ID found in result. Full result:', result);
      throw new Error(`Resend API did not return a message ID. Response: ${JSON.stringify(result)}`);
    }

    const messageId = result.id || result.data?.id;
    console.log(`Email sent successfully to ${email}, ID:`, messageId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        messageId: messageId,
        verificationCode: verificationCode,
        message: `Verification email sent to ${email}`
      })
    };

  } catch (error) {
    console.error('Send email error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: 'Failed to send verification email'
      })
    };
  }
};
