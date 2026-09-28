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
  const commitRef = resolveCommitRef(env);
  if (env.NETLIFY === 'true' && env.CONTEXT === 'production') {
    if (clean(env.BRANCH) !== 'main') throw new Error('Build de producción fuera de main');
    if (!SHA_RE.test(clean(env.COMMIT_REF))) throw new Error('Build de producción sin COMMIT_REF válido de Netlify');
    if (SHA_RE.test(clean(env.GITHUB_SHA)) && clean(env.COMMIT_REF).toLowerCase() !== clean(env.GITHUB_SHA).toLowerCase()) {
      throw new Error('COMMIT_REF y GITHUB_SHA identifican revisiones distintas en producción');
    }
  }
  const meta = {
    version: 1,
    commitRef,
    branch: clean(env.BRANCH || env.GITHUB_REF_NAME) || null,
    context: clean(env.CONTEXT) || (env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local'),
    generatedAt: now().toISOString()
  };
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'build-meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

if (require.main === module) {
  console.log('[build-meta]', JSON.stringify(writeBuildMeta()));
}

module.exports = { resolveCommitRef, writeBuildMeta };
