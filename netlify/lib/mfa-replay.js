'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('./blob-store');

function replayKey(email, code) {
  return crypto.createHash('sha256').update(`${String(email || '').trim().toLowerCase()}|${String(code || '').trim()}`).digest('hex');
}

async function consume(email, code) {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return { ok: false, code: 'MFA_CODE_INVALID', error: 'Código MFA no válido.' };
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const store = getBlobStore(`mfa-replay-${day}`);
  if (!store || typeof store.setJSON !== 'function') return { ok: false, code: 'MFA_REPLAY_GUARD_UNAVAILABLE', error: 'El control anti-replay MFA no está disponible.' };
  try {
    const result = await store.setJSON(replayKey(email, normalized), { at: new Date().toISOString() }, { onlyIfNew: true });
    if (result?.modified !== true) return { ok: false, code: 'MFA_REPLAY_BLOCKED', error: 'Ese código MFA ya fue utilizado. Espera al siguiente código.' };
    return { ok: true };
  } catch {
    return { ok: false, code: 'MFA_REPLAY_GUARD_UNAVAILABLE', error: 'El control anti-replay MFA no está disponible.' };
  }
}

module.exports = { consume, replayKey };
