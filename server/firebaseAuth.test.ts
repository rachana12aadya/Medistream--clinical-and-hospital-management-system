import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyFirebaseJwtWithCerts } from './firebaseAuth.ts';

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signMockJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = 'test-kid-1'
): string {
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = toBase64Url(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  const signature = toBase64Url(signer.sign(privateKey));
  return `${header}.${body}.${signature}`;
}

test('verifyFirebaseJwtWithCerts accepts valid RS256 Firebase ID token and rejects tampered or expired tokens', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const certs = { 'test-kid-1': publicPem };
  const projectId = 'medistream-test-project';
  const nowSec = 1_760_000_000;

  const validJwt = signMockJwt(
    {
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'firebase-uid-123',
      iat: nowSec - 60,
      exp: nowSec + 3600,
      email: 'Patient.User@Example.org',
      email_verified: true,
      name: 'Priya Sundaram',
    },
    privateKey
  );

  const verified = verifyFirebaseJwtWithCerts(validJwt, certs, projectId, nowSec);
  assert.equal(verified.uid, 'firebase-uid-123');
  assert.equal(verified.email, 'patient.user@example.org');
  assert.equal(verified.emailVerified, true);
  assert.equal(verified.name, 'Priya Sundaram');

  assert.throws(
    () => verifyFirebaseJwtWithCerts(`${validJwt}x`, certs, projectId, nowSec),
    /signature/i
  );

  const expiredJwt = signMockJwt(
    {
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'firebase-uid-123',
      iat: nowSec - 7200,
      exp: nowSec - 10,
      email: 'patient@example.org',
      email_verified: true,
    },
    privateKey
  );
  assert.throws(() => verifyFirebaseJwtWithCerts(expiredJwt, certs, projectId, nowSec), /expired/i);

  const wrongAudJwt = signMockJwt(
    {
      aud: 'other-project',
      iss: `https://securetoken.google.com/${projectId}`,
      sub: 'firebase-uid-123',
      iat: nowSec - 10,
      exp: nowSec + 1000,
      email: 'patient@example.org',
    },
    privateKey
  );
  assert.throws(() => verifyFirebaseJwtWithCerts(wrongAudJwt, certs, projectId, nowSec), /audience/i);
});
