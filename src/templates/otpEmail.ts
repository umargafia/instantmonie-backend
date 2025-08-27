import fs from 'fs';
import path from 'path';

interface OTPEmailTemplateProps {
  otp: string;
  expiryMinutes: number;
  type: 'forgot-password' | 'verify-email' | 'withdrawal';
  firstName: string;
}

// Primary color changed to purple
const EMBEDDED_OTP_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your InstantMonee Verification Code</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      body {
        font-family: 'Inter', Arial, sans-serif;
        line-height: 1.6;
        margin: 0;
        padding: 0;
        background-color: #f8fafc;
      }

      .container {
        max-width: 600px;
        margin: 20px auto;
        padding: 0;
        background-color: #ffffff;
        border-radius: 16px;
        box-shadow:
          0 4px 6px -1px rgba(0, 0, 0, 0.1),
          0 2px 4px -1px rgba(0, 0, 0, 0.06);
        overflow: hidden;
      }

      .header {
        text-align: center;
        padding: 40px 20px;
        background: linear-gradient(135deg, #a21caf 0%, #7c3aed 100%);
        position: relative;
        overflow: hidden;
      }

      .header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: url('data:image/svg+xml,<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" fill="rgba(255,255,255,0.1)"/></svg>');
        opacity: 0.1;
      }

      .logo {
        margin-bottom: 24px;
        position: relative;
        display: inline-block;
        background: rgba(255, 255, 255, 0.1);
        padding: 16px;
        border-radius: 12px;
        -webkit-backdrop-filter: blur(8px);
        backdrop-filter: blur(8px);
        box-shadow:
          0 4px 6px -1px rgba(0, 0, 0, 0.1),
          0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }

      .logo img {
        height: 45px;
        width: auto;
        display: block;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
      }

      .header h1 {
        color: #ffffff;
        margin: 0;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.5px;
        position: relative;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .content {
        padding: 40px 32px;
        text-align: center;
        background-color: #ffffff;
      }

      .welcome-message {
        color: #1e293b;
        margin-bottom: 24px;
        font-size: 24px;
        font-weight: 700;
      }

      .message {
        color: #475569;
        margin-bottom: 32px;
        font-size: 16px;
        line-height: 1.6;
      }

      .otp-container {
        margin: 40px 0;
        padding: 32px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 16px;
        border: 1px solid #e2e8f0;
      }

      .otp-code {
        font-size: 48px;
        font-weight: 700;
        color: #a21caf;
        letter-spacing: 8px;
        margin: 24px 0;
        font-family: 'Inter', monospace;
        background: rgba(255, 255, 255, 0.5);
        padding: 24px;
        border-radius: 12px;
        border: 2px dashed #a21caf;
        display: inline-block;
      }

      .expiry {
        color: #64748b;
        font-size: 14px;
        margin-top: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .warning {
        margin: 32px 0;
        padding: 24px;
        background: #fef2f2;
        border: 1px solid #fee2e2;
        border-radius: 12px;
        color: #991b1b;
        font-size: 14px;
        text-align: left;
      }

      .warning strong {
        display: block;
        margin-bottom: 8px;
        color: #dc2626;
      }

      .security-info {
        margin: 40px 0;
        padding: 32px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-radius: 16px;
        border: 1px solid #e2e8f0;
      }

      .security-info h2 {
        color: #1e293b;
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 16px 0;
        text-align: center;
      }

      .security-info ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      .security-info li {
        display: flex;
        align-items: center;
        color: #475569;
        font-size: 14px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }

      .security-info li::before {
        content: '✓';
        color: #a21caf;
        font-weight: bold;
        margin-right: 8px;
      }

      .footer {
        text-align: center;
        padding: 32px;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border-top: 1px solid #e2e8f0;
      }

      .social-links {
        margin: 0 0 24px 0;
      }

      .social-links a {
        display: inline-block;
        margin: 0 12px;
        color: #475569;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
      }

      .social-links a:hover {
        color: #a21caf;
      }

      .footer-text {
        color: #64748b;
        font-size: 13px;
        margin: 8px 0;
      }

      @media (max-width: 480px) {
        .container {
          margin: 0;
          border-radius: 0;
        }

        .header {
          padding: 32px 16px;
        }

        .logo {
          padding: 12px;
          margin-bottom: 20px;
        }

        .logo img {
          height: 40px;
        }

        .header h1 {
          font-size: 24px;
        }

        .content {
          padding: 24px 16px;
        }

        .otp-code {
          font-size: 36px;
          letter-spacing: 6px;
          padding: 16px;
        }

        .security-info ul {
          grid-template-columns: 1fr;
        }

        .social-links a {
          margin: 0 8px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Verification Code</h1>
      </div>

      <div class="content">
        <p class="welcome-message">Hello {{firstName}}!</p>
        <p class="message">
          Your verification code for {{type}} is below. This code will expire in {{expiryMinutes}} minutes.
        </p>

        <div class="otp-container">
          <div class="otp-code">{{otp}}</div>
          <div class="expiry">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
        </div>

        <div class="warning">
          <strong>Important:</strong>
          <p>
            If you didn't request this code, please ignore this email or contact our support team
            immediately if you have concerns about your account's security.
          </p>
        </div>

        <div class="security-info">
          <h2>Security First</h2>
          <ul>
            <li>Never share your verification code</li>
            <li>Don't forward this email to anyone</li>
            <li>Our team will never ask for your code</li>
            <li>Keep your account details secure</li>
          </ul>
        </div>
      </div>

      <div class="footer">
        
        <p class="footer-text">© {{currentYear}} InstantMonee. All rights reserved.</p>
        <p class="footer-text">This is an automated message, please do not reply.</p>
      </div>
    </div>
  </body>
</html>`;

export const getOTPEmailTemplate = ({
  otp,
  expiryMinutes,
  type,
  firstName,
}: OTPEmailTemplateProps): string => {
  const getTypeText = () => {
    switch (type) {
      case 'forgot-password':
        return 'Password Reset';
      case 'verify-email':
        return 'Email Verification';
      case 'withdrawal':
        return 'Withdrawal Verification';
      default:
        return 'Verification';
    }
  };

  // Use embedded template directly
  let template = EMBEDDED_OTP_TEMPLATE;

  // Replace placeholders with actual values
  template = template
    .replace('{{type}}', getTypeText())
    .replace('{{otp}}', otp)
    .replace('{{expiryMinutes}}', expiryMinutes.toString())
    .replace('{{currentYear}}', new Date().getFullYear().toString())
    .replace('{{firstName}}', firstName);

  return template;
};
