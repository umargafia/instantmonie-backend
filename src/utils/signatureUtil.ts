import crypto from 'crypto';

// Function to generate a signature
export function webhookGenerateSign(params: any, privateKey: string) {
  try {
    // Ensure private key is in correct format
    const formattedPrivateKey = privateKey.includes('-----BEGIN PRIVATE KEY-----')
      ? privateKey
      : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;

    // Step 1: Sort and concatenate parameters
    const strA = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    console.log('Webhook String to sign:', strA);

    // Step 2: Generate MD5 hash
    const md5Str = crypto.createHash('md5').update(strA).digest('hex').toUpperCase();
    console.log('Webhook MD5 hash:', md5Str);

    // Step 3: Sign with RSA
    const signer = crypto.createSign('RSA-SHA1');
    signer.update(md5Str);
    const signature = signer.sign(formattedPrivateKey, 'base64');

    // Step 4: URL encode the signature
    const encodedSignature = encodeURIComponent(signature);
    console.log('Webhook Signature:', encodedSignature);

    return encodedSignature;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error generating webhook signature:', error.message);
      throw new Error('Failed to generate webhook signature: ' + error.message);
    } else {
      console.error('Error generating webhook signature:', error);
      throw new Error('Failed to generate webhook signature: ' + String(error));
    }
  }
}

function generateSign(params: any, privateKey: string) {
  try {
    // Ensure private key is in correct format
    const formattedPrivateKey = privateKey.includes('-----BEGIN PRIVATE KEY-----')
      ? privateKey
      : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;

    // Step 1: Sort and concatenate parameters
    const strA = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    // Step 2: Generate MD5 hash
    const md5Str = crypto.createHash('md5').update(strA).digest('hex').toUpperCase();

    // Step 3: Sign with RSA
    const sign = crypto.createSign('RSA-SHA1').update(md5Str).sign(formattedPrivateKey, 'base64');

    return sign;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error generating signature:', error.message);
      throw new Error('Failed to generate signature: ' + error.message);
    } else {
      console.error('Error generating signature:', error);
      throw new Error('Failed to generate signature: ' + String(error));
    }
  }
}

export default generateSign;
