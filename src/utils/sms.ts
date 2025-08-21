import twilio from 'twilio';

interface SMSOptions {
  phone: string;
  message: string;
}

export const sendSMS = async (options: SMSOptions) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials not configured');
  }

  const client = twilio(accountSid, authToken);

  await client.messages.create({
    body: options.message,
    from: fromNumber,
    to: options.phone,
  });
};
