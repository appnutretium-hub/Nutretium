'use strict';

const fs = require('fs');
const path = require('path');

const SHA_RE = /^[0-9a-f]{40}$/i;
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function clean(value) {
  return String(value || '').trim();
}

function resolveCommitRef(env = process.env) {
  for (const value of [env.COMMIT_REF, env.GITHUB_SHA]) {
    const sha = clean(value);
    if (SHA_RE.test(sha)) return sha;
  }
  return null;
}

function writeBuildMeta({ env = process.env, now = () => new Date() } = {}) {
  fs.mkdirSync(DIST, { recursive: true });
  const meta = {
    version: 1,
    commitRef: resolveCommitRef(env),
    branch: clean(env.BRANCH || env.GITHUB_REF_NAME) || null,
    context: clean(env.CONTEXT) || (env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local'),
    generatedAt: now().toISOString()
  };
  fs.writeFileSync(path.join(DIST, 'build-meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

if (require.main === module) {
  console.log('[build-meta]', JSON.stringify(writeBuildMeta()));
}

module.exports = { resolveCommitRef, writeBuildMeta };
