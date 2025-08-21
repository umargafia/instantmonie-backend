import fs from 'fs';
import path from 'path';

interface WelcomeEmailTemplateProps {
  firstName: string;
  businessName?: string;
  dashboardUrl: string;
}

// Complete embedded welcome email template
const EMBEDDED_WELCOME_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to GafiaPay</title>
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
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
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
        color: #1e293b;
        margin-bottom: 24px;
        font-size: 16px;
        font-weight: 500;
        text-align: left;
        max-width: 500px;
        margin-left: auto;
        margin-right: auto;
      }

      .features-section {
        margin-top: 32px;
        text-align: left;
      }

      .features-section h2 {
        color: #1e293b;
        font-size: 18px;
        margin: 0 0 16px 0;
        font-weight: 600;
        text-align: center;
      }

      .feature-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        margin-top: 24px;
      }

      .feature-item {
        background-color: #f8fafc;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
        border: 1px solid #e2e8f0;
      }

      .feature-icon {
        font-size: 24px;
        margin-bottom: 12px;
      }

      .feature-title {
        font-weight: 600;
        color: #1e293b;
        margin: 0 0 8px 0;
      }

      .feature-description {
        color: #64748b;
        font-size: 14px;
        margin: 0;
      }

      .cta {
        margin: 40px 0;
        text-align: center;
        display: flex;
        gap: 16px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 16px 32px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 600;
        font-size: 16px;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .button.primary {
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #ffffff;
        box-shadow:
          0 4px 6px -1px rgba(37, 99, 235, 0.2),
          0 2px 4px -1px rgba(37, 99, 235, 0.1);
      }

      .button.secondary {
        background: #ffffff;
        color: #2563eb;
        border: 2px solid #2563eb;
        box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.1);
      }

      .button:hover {
        transform: translateY(-2px);
      }

      .button.primary:hover {
        box-shadow:
          0 6px 8px -1px rgba(37, 99, 235, 0.3),
          0 4px 6px -1px rgba(37, 99, 235, 0.2);
      }

      .button.secondary:hover {
        background: #f8fafc;
        box-shadow: 0 6px 8px -1px rgba(37, 99, 235, 0.2);
      }

      .button:active {
        transform: translateY(0);
      }

      .button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        transition: 0.5s;
      }

      .button:hover::before {
        left: 100%;
      }

      .button::after {
        content: '→';
        margin-left: 8px;
        transition: transform 0.3s ease;
      }

      .button:hover::after {
        transform: translateX(4px);
      }

      @media (max-width: 480px) {
        .container {
          margin: 0;
          border-radius: 0;
        }

        .content {
          padding: 24px 16px;
        }

        .feature-grid {
          grid-template-columns: 1fr;
        }

        .feature-item {
          padding: 16px;
        }

        .cta {
          flex-direction: column;
          gap: 12px;
        }

        .button {
          padding: 14px 28px;
          font-size: 15px;
          width: 100%;
          max-width: 280px;
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
      }

      .security-section {
        margin-top: 32px;
        padding: 24px;
        background-color: #f8fafc;
        border-radius: 12px;
        text-align: left;
      }

      .security-section h2 {
        color: #1e293b;
        font-size: 18px;
        margin: 0 0 16px 0;
        font-weight: 600;
        text-align: center;
      }

      .security-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .security-list li {
        display: flex;
        align-items: flex-start;
        margin-bottom: 12px;
        color: #475569;
        font-size: 14px;
      }

      .security-list li::before {
        content: '✓';
        color: #2563eb;
        font-weight: bold;
        margin-right: 8px;
      }

      .footer {
        text-align: center;
        padding: 24px 32px;
        color: #64748b;
        font-size: 13px;
        border-top: 1px solid #e2e8f0;
        background-color: #f8fafc;
      }

      .social-links {
        margin: 16px 0;
      }

      .social-links a {
        display: inline-block;
        margin: 0 8px;
        color: #64748b;
        text-decoration: none;
      }

      .social-links a:hover {
        color: #2563eb;
      }

      .divider {
        height: 1px;
        background-color: #e2e8f0;
        margin: 24px 0;
      }

      .support {
        margin-top: 16px;
        color: #2563eb;
        text-decoration: none;
        font-weight: 500;
      }

      .support:hover {
        text-decoration: underline;
      }

      .contact-info {
        margin-top: 16px;
        font-size: 12px;
        color: #94a3b8;
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

      .security-info p {
        color: #475569;
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
        color: #2563eb;
        font-weight: bold;
        margin-right: 8px;
      }

      .support {
        margin: 40px 0;
        padding: 32px;
        background: #ffffff;
        border-radius: 16px;
        border: 1px solid #e2e8f0;
      }

      .support h2 {
        color: #1e293b;
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 16px 0;
        text-align: center;
      }

      .support p {
        color: #475569;
        margin: 0 0 16px 0;
        text-align: center;
      }

      .support ul {
        list-style: none;
        padding: 0;
        margin: 0 0 24px 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      .support li {
        display: flex;
        align-items: center;
        color: #475569;
        font-size: 14px;
        padding: 12px;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }

      .support li::before {
        content: '•';
        color: #2563eb;
        font-weight: bold;
        margin-right: 8px;
      }

      .support a {
        color: #2563eb;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
      }

      .support a:hover {
        color: #1d4ed8;
        text-decoration: underline;
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
        color: #2563eb;
      }

      .footer-text {
        color: #64748b;
        font-size: 13px;
        margin: 8px 0;
      }

      @media (max-width: 480px) {
        .security-info,
        .support {
          padding: 24px;
          margin: 32px 0;
        }

        .security-info ul,
        .support ul {
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
        <div class="logo">
          <img
            src="https://www.dropbox.com/scl/fi/esjpan8ewl9enf48pwqbp/primary-logo-R.png?rlkey=fykelqzmhnhbcizpa4jv07rli&st=vpf42i5f&dl=1"
            alt="GafiaPay Logo"
          />
        </div>
        <h1>Welcome to GafiaPay</h1>
      </div>

      <div class="content">
        <p class="welcome-message">Hello {{firstName}}!</p>
        <p>
          Thank you for choosing GafiaPay as your payment processing solution. We're excited to help
          you manage your business payments securely and efficiently.
        </p>

        <div class="features">
          <h2>What You Can Do</h2>
          <div class="feature-grid">
            <div class="feature-item">
              <div class="feature-icon">💳</div>
              <h3>Virtual Accounts</h3>
              <p>Generate and manage virtual account numbers for your customers</p>
            </div>
            <div class="feature-item">
              <div class="feature-icon">📊</div>
              <h3>Business Analytics</h3>
              <p>Track transactions, revenue, and business performance in real-time</p>
            </div>
            <div class="feature-item">
              <div class="feature-icon">🔒</div>
              <h3>Secure API</h3>
              <p>Integrate payments with secure API keys and webhooks</p>
            </div>
            <div class="feature-item">
              <div class="feature-icon">👥</div>
              <h3>Customer Management</h3>
              <p>Manage customer data and KYC verification</p>
            </div>
          </div>
        </div>

        <div class="cta">
          <a href="https://gafiapay.com/login" class="button primary"> Go to Dashboard </a>
          <a href="https://docs.gafiapay.com/introduction/" class="button secondary">
            Go to Docs
          </a>
        </div>

        <div class="security-info">
          <h2>Security First</h2>
          <p>Your security is our priority. We provide:</p>
          <ul>
            <li>Bank-grade encryption</li>
            <li>API key authentication</li>
            <li>Real-time fraud prevention</li>
            <li>Secure transaction processing</li>
          </ul>
        </div>

        <div class="support">
          <h2>Need Help?</h2>
          <p>Our support team is available 24/7 to assist you with:</p>
          <ul>
            <li>API integration</li>
            <li>Account setup</li>
            <li>Transaction issues</li>
            <li>Technical support</li>
          </ul>
          <p>Contact us at <a href="mailto:support@gafiapay.com">support@gafiapay.com</a></p>
        </div>
      </div>

      <div class="footer">
        <div class="social-links">
          <a href="https://twitter.com/gafiapay">Twitter</a>
          <a href="https://linkedin.com/company/gafiapay">LinkedIn</a>
          <a href="https://docs.gafiapay.com/introduction/">API Docs</a>
        </div>
        <p class="footer-text">© {{currentYear}} GafiaPay. All rights reserved.</p>
        <p class="footer-text">This is an automated message, please do not reply.</p>
      </div>
    </div>
  </body>
</html>`;

export const getWelcomeEmailTemplate = ({
  firstName,
  dashboardUrl,
}: WelcomeEmailTemplateProps): string => {
  // Use embedded template directly
  let template = EMBEDDED_WELCOME_TEMPLATE;

  // Replace placeholders with actual values
  template = template
    .replace('{{firstName}}', firstName)
    .replace('{{dashboardUrl}}', dashboardUrl)
    .replace('{{currentYear}}', new Date().getFullYear().toString());

  return template;
};
