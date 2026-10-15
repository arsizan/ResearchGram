// A throwaway ES256 key pair, only for the browser tests (Phase 5): sessions
// signed the way Supabase signs them once its asymmetric JWT signing keys are
// on, so the tests can check that proxy.ts verifies them itself. This key
// protects nothing; it is not used anywhere else.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const TEST_KID = 'e2e-es256-test-key';

const PRIVATE_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'PevgtFWUOwhF4SCSN34mtA8_3iaBqBoVFbQlirsrBhI',
  y: 'FGryPqXwH6L9upDDYUw5vJmnSBtGvQ4yNRZmbFS2coM',
  d: '0CYzPiow_vwuTKIEVmVhHDvK4oiptcBvNN7YaSZaAHs',
};

/** What /auth/v1/.well-known/jwks.json publishes. */
export const PUBLIC_JWK = { kty: 'EC', crv: 'P-256', x: PRIVATE_JWK.x, y: PRIVATE_JWK.y, kid: TEST_KID, alg: 'ES256', use: 'sig', key_ops: ['verify'] };

const privateKey = createPrivateKey({ key: PRIVATE_JWK, format: 'jwk' });
const publicKey = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: PRIVATE_JWK.x, y: PRIVATE_JWK.y }, format: 'jwk' });

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An ES256 access token, as Supabase Auth issues them with signing keys. */
export function signEs256(claims, { kid = TEST_KID } = {}) {
  const head = `${b64({ alg: 'ES256', typ: 'JWT', kid })}.${b64(claims)}`;
  const signature = sign('sha256', Buffer.from(head), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${signature.toString('base64url')}`;
}

/** True when an ES256 token carries a valid signature from the test key. */
export function verifyEs256(token) {
  const [head, payload, signature] = String(token || '').split('.');
  if (!head || !payload || !signature) return false;
  try {
    return verify('sha256', Buffer.from(`${head}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}
