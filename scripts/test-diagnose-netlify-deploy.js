'use strict';
const assert = require('node:assert/strict');
const { diagnose } = require('./diagnose-netlify-deploy');
const SHA = 'a'.repeat(40);

(async () => {
  const reply = data => async () => ({ ok: true, json: async () => data });
  assert.deepEqual(await diagnose(SHA, reply([{ commit_ref: SHA, branch: 'main', state: 'error', skipped: true, id: 'd1' }])),
    { conclusive: true, failed: true, state: 'error', skipped: true, id: 'd1' });
  assert.equal((await diagnose(SHA, reply([{ commit_ref: SHA, branch: 'preview', state: 'ready' }]))).conclusive, false);
  assert.equal((await diagnose(SHA, reply([{ commit_ref: SHA, branch: 'main', state: 'ready', id: 'd2' }]))).failed, false);
  assert.equal((await diagnose(SHA, async () => { throw new Error('offline'); })).conclusive, false);
  await assert.rejects(() => diagnose('invalid', reply([])), /EXPECTED_SHA/);
  console.log('[test-diagnose-netlify-deploy] OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
