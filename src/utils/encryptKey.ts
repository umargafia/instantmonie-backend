import { env } from '@/config/env';
import crypto from 'crypto';

export const algorithm = 'aes-256-cbc';
export const rawEncryptionKey = env.ENCRYPTION_KEY;

function getEncryptionKey(key: string): Buffer {
  return crypto.createHash('sha256').update(key).digest(); // Always 32 bytes
}

export const encryptionKey = getEncryptionKey(rawEncryptionKey);

export default function encryptKey(text: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(encryptionKey), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}
