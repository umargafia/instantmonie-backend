import { env } from '@/config/env';
import crypto from 'crypto';

export function verifySignature(notification: any): boolean {
  try {
    const { sign, ...params } = notification;

    if (!sign) {
      console.warn('No signature provided in notification');
      return false;
    }

    // 1. URL-decode the signature (PalmPay sends URL-encoded signatures)
    const decodedSign = decodeURIComponent(sign);
    console.log('Decoded signature:', decodedSign);

    // 2. Prepare the string to verify (exclude null/empty values)
    const strA = Object.keys(params)
      .filter((key) => params[key] !== null && params[key] !== undefined && params[key] !== '')
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    console.log('String to verify:', strA);

    // 3. Generate MD5 hash (uppercase as required by PalmPay)
    const md5Str = crypto.createHash('md5').update(strA).digest('hex').toUpperCase();
    console.log('MD5 hash:', md5Str);

    // 4. Prepare the public key in proper PEM format
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCVT+pLc1nkz9z803SOmF48bMFn
0GYF4ng6nxj0ojUeu4KeNKkkw/nfureTtL77j9RpMjquJzzKdOZfHRvQyuAbaLoa
SD1uU47npNiAL05bLYZEoZWvFOar9gNbIesea8MX0DeYncA2Tkr3kUo8K6XBrZ+T
cV2Q8NEvm1T536LOGwIDAQAB
-----END PUBLIC KEY-----`;

    // 5. Verify the signature
    const verifier = crypto.createVerify('RSA-SHA1');
    verifier.update(md5Str);
    const isValid = verifier.verify(publicKeyPem, decodedSign, 'base64');

    console.log('Signature verification result:', isValid);
    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}
