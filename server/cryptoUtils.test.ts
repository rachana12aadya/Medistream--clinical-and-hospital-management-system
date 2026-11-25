import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptPHI,
  encryptPHI,
  generateSixDigitOtp,
  getKeyFingerprint,
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './cryptoUtils.ts';

const TEST_SECRET = 'medistream-test-hipaa-master-key-2026';

test('AES-256-GCM PHI encryption roundtrips plaintext and produces unique ciphertexts', () => {
  const plaintext = 'Patient diagnosed with mild mitral regurgitation; prescribed Metoprolol 25mg.';
  const cipher1 = encryptPHI(plaintext, TEST_SECRET);
  const cipher2 = encryptPHI(plaintext, TEST_SECRET);

  assert.ok(cipher1.startsWith('enc:v1:'));
  assert.notEqual(cipher1, cipher2);
  assert.equal(cipher1.includes('Metoprolol'), false);
  assert.equal(decryptPHI(cipher1, TEST_SECRET), plaintext);
  assert.equal(decryptPHI(cipher2, TEST_SECRET), plaintext);
});

test('scrypt password hashing verifies correct passwords and rejects wrong ones', () => {
  const hash = hashPassword('ClinicalPass#2026');
  assert.ok(hash.startsWith('scrypt:'));
  assert.equal(verifyPassword('ClinicalPass#2026', hash), true);
  assert.equal(verifyPassword('WrongPass#2026', hash), false);
});

test('HMAC session token signs, verifies, and rejects tampered or expired tokens', () => {
  const token = signSessionToken(
    {
      userId: 'usr-1',
      email: 'admin@medistream.org',
      role: 'admin',
      portal: 'admin',
      exp: Date.now() + 60_000,
    },
    TEST_SECRET
  );

  const verified = verifySessionToken(token, TEST_SECRET);
  assert.ok(verified);
  assert.equal(verified.role, 'admin');

  assert.equal(verifySessionToken(`${token}tamper`, TEST_SECRET), null);

  const expired = signSessionToken(
    {
      userId: 'usr-1',
      email: 'admin@medistream.org',
      role: 'admin',
      portal: 'admin',
      exp: Date.now() - 1000,
    },
    TEST_SECRET
  );
  assert.equal(verifySessionToken(expired, TEST_SECRET), null);
});

test('OTP generation and key fingerprint format', () => {
  const otp = generateSixDigitOtp();
  assert.match(otp, /^\d{6}$/);
  assert.match(getKeyFingerprint(TEST_SECRET), /^AES256-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
});
