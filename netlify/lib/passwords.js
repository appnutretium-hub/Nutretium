'use strict';

const crypto = require('crypto');

const ALGORITHM = 'pbkdf2-sha512';
const ITERATIONS = 220000;
const LEGACY_ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';
const MIN_ITERATIONS = 100000;
const MAX_ITERATIONS = 1000000;

function derive(password, salt, iterations) {
  return crypto.pbkdf2Sync(String(password), String(salt), iterations, KEY_LENGTH, DIGEST);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = derive(password, salt, ITERATIONS).toString('hex');
  return `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;
}

function parseHash(stored) {
  const value = String(stored || '');
  if (value.startsWith(`${ALGORITHM}$`)) {
    const parts = value.split('$');
    if (parts.length !== 4) return null;
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const hash = parts[3];
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return null;
    if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(hash)) return null;
    return { algorithm:ALGORITHM, iterations, salt, hash, legacy:false };
  }

  const legacy = value.split(':');
  if (legacy.length === 2 && /^[a-f0-9]{32}$/i.test(legacy[0]) && /^[a-f0-9]{128}$/i.test(legacy[1])) {
    return { algorithm:ALGORITHM, iterations:LEGACY_ITERATIONS, salt:legacy[0], hash:legacy[1], legacy:true };
  }
  return null;
}

function verifyPassword(password, stored) {
  try {
    const parsed = parseHash(stored);
    if (!parsed) return { ok:false, needsRehash:false, scheme:null };
    const expected = Buffer.from(parsed.hash, 'hex');
    const actual = derive(password, parsed.salt, parsed.iterations);
    const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    return {
      ok,
      needsRehash: ok && (parsed.legacy || parsed.iterations !== ITERATIONS),
      scheme: parsed.legacy ? 'legacy-pbkdf2-sha512' : ALGORITHM,
    };
  } catch {
    return { ok:false, needsRehash:false, scheme:null };
  }
}

module.exports = {
  ALGORITHM,
  ITERATIONS,
  LEGACY_ITERATIONS,
  hashPassword,
  parseHash,
  verifyPassword,
};
