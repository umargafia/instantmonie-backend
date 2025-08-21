import crypto from 'crypto';

/**
 * Generates a PalmPay-compatible signature (FINAL WORKING VERSION)
 */
export function generatePalmPaySignature(params: Record<string, any>, privateKey: string): string {
  // 1. Remove undefined/null values and sort keys
  const filteredParams: Record<string, any> = {};
  Object.keys(params)
    .sort()
    .forEach((key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        filteredParams[key] = params[key];
      }
    });

  // 2. Create signing string
  const strA = Object.entries(filteredParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  // 3. Generate uppercase MD5 hash
  const md5Str = crypto.createHash('md5').update(strA).digest('hex').toUpperCase();

  // 4. Format private key
  const formattedKey = privateKey.includes('BEGIN PRIVATE KEY')
    ? privateKey
    : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;

  // 5. Create signature
  const signer = crypto.createSign('RSA-SHA1');
  signer.update(md5Str);
  return signer.sign(formattedKey, 'base64');
}
