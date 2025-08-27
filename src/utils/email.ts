import nodemailer from 'nodemailer';
import { env } from '../config/env';

interface EmailOptions {
  email: string;
  subject: string;
  message: string;
  html?: string;
}

export const sendEmail = async (options: EmailOptions) => {
  // Create a transporter
  const transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: Number(env.EMAIL_PORT),
    secure: true,
    auth: {
      user: env.EMAIL_USERNAME,
      pass: env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Define email options
  const mailOptions = {
    from: `InstantMonee <${env.EMAIL_FROM}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  // Send email
  await transporter.sendMail(mailOptions);
};
