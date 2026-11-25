import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache: CertCache = { certs: {}, expiresAt: 0 };

export function getFirebaseProjectId(): string {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
    // Fallback to env var
  }
  return process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0470185171';
}

function base64UrlDecode(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }

  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google Firebase public keys (${res.status}).`);
  }

  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  certCache = {
    certs,
    expiresAt: now + maxAgeSec * 1000,
  };
  return certs;
}

export function verifyFirebaseJwtWithCerts(
  idToken: string,
  certs: Record<string, string>,
  projectId: string,
  nowSec: number = Math.floor(Date.now() / 1000)
): VerifiedFirebaseToken {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Invalid Firebase ID token encoding.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase token signing algorithm.');
  }

  const publicKeyPem = certs[header.kid];
  if (!publicKeyPem) {
    throw new Error('Firebase signing key not recognized.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = base64UrlDecode(sigB64);
  if (!verifier.verify(publicKeyPem, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  if (payload.aud !== projectId) {
    throw new Error('Firebase ID token audience mismatch.');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error('Firebase ID token issuer mismatch.');
  }

  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token has expired.');
  }

  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase ID token issued-at timestamp is invalid.');
  }

  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Firebase ID token missing valid subject UID.');
  }

  if (!payload.email || typeof payload.email !== 'string') {
    throw new Error('Firebase account does not expose an email address.');
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: (payload.name && payload.name.trim()) || payload.email.split('@')[0],
    picture: payload.picture,
  };
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const projectId = getFirebaseProjectId();
  const certs = await fetchGooglePublicCerts();
  return verifyFirebaseJwtWithCerts(idToken, certs, projectId);
}
