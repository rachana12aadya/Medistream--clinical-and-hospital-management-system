import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export function deriveKeyBuffer(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function getKeyFingerprint(secret: string): string {
  const hash = createHash('sha256').update(secret).digest('hex').toUpperCase();
  return `AES256-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

export function encryptPHI(plaintext: string, secret: string): string {
  const key = deriveKeyBuffer(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptPHI(payload: string, secret: string): string {
  if (!payload.startsWith('enc:v1:')) {
    return payload;
  }
  const parts = payload.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted PHI payload format');
  }
  const [, , ivB64, tagB64, dataB64] = parts;
  const key = deriveKeyBuffer(secret);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function generateSixDigitOtp(): string {
  return String(randomInt(100000, 999999));
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'patient' | 'doctor' | 'staff' | 'admin';
  portal: 'user' | 'doctor' | 'admin';
  exp: number;
}

export function signSessionToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
