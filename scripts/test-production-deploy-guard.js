'use strict';

const assert = require('assert');
const policy = require('../netlify/lib/main-origin-policy');
const guard = require('./verify-production-deploy-origin');
const meta = require('./write-build-meta');

const TRUSTED = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CANDIDATE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const VERIFIED_LIVE = 'cccccccccccccccccccccccccccccccccccccccc';
const POISONED_LIVE = 'dddddddddddddddddddddddddddddddddddddddd';
const REPO = 'appnutretium-hub/Nutretium';
const MERGED_PR = [{ number: 125, merged_at: '2026-09-22T22:00:00Z', base: { ref: 'main' } }];

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; },
    async text() { return typeof data === 'string' ? data : JSON.stringify(data); }
  };
}

function env() {
  return {
    NETLIFY: 'true',
    CONTEXT: 'production',
    BRANCH: 'main',
    COMMIT_REF: CANDIDATE,
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPO: REPO,
    GITHUB_BRANCH: 'main'
  };
}

function config() {
  return { productionTrust: { productionUrl: 'https://nutretium.com', bootstrapSha: TRUSTED } };
}

function mockFetch({ pulls = MERGED_PR, commit, liveMeta = { commitRef: TRUSTED } } = {}) {
  return async url => {
    const value = String(url);
    if (value.startsWith('https://nutretium.com/build-meta.json')) return response(liveMeta);
    if (value.endsWith('/branches/main')) return response({ commit: { sha: CANDIDATE } });
    if (value.includes(`/compare/${TRUSTED}...${CANDIDATE}`)) {
      return response({ status: 'ahead', total_commits: 1, commits: [{ sha: CANDIDATE }] });
    }
    if (value.endsWith(`/commits/${CANDIDATE}/pulls`)) return response(pulls);
    if (value.endsWith(`/commits/${CANDIDATE}`)) return response(commit || {
      commit: { message: 'direct change' },
      files: [{ filename: 'app.js' }],
      parents: [{ sha: TRUSTED }]
    });
    throw new Error(`URL no simulada: ${value}`);
  };
}

function verifiedLiveFetch() {
  return async url => {
    const value = String(url);
    if (value.startsWith('https://nutretium.com/build-meta.json')) return response({ commitRef: VERIFIED_LIVE });
    if (value.includes(`/compare/${TRUSTED}...${VERIFIED_LIVE}`)) {
      return response({ status: 'ahead', total_commits: 1, commits: [{ sha: VERIFIED_LIVE }] });
    }
    if (value.endsWith(`/commits/${VERIFIED_LIVE}/pulls`)) return response(MERGED_PR);
    throw new Error(`URL no simulada: ${value}`);
  };
}

function poisonedRecoveryFetch() {
  return async url => {
    const value = String(url);
    if (value.startsWith('https://nutretium.com/build-meta.json')) return response({ commitRef: POISONED_LIVE });
    if (value.endsWith('/branches/main')) return response({ commit: { sha: CANDIDATE } });

    if (value.includes(`/compare/${TRUSTED}...${POISONED_LIVE}`)) {
      return response({ status: 'ahead', total_commits: 1, commits: [{ sha: POISONED_LIVE }] });
    }
    if (value.endsWith(`/commits/${POISONED_LIVE}/pulls`)) return response([]);
    if (value.endsWith(`/commits/${POISONED_LIVE}`)) return response({
      commit: { message: 'direct unreviewed production mutation' },
      files: [{ filename: 'app.js' }],
      parents: [{ sha: TRUSTED }]
    });

    if (value.includes(`/compare/${TRUSTED}...${CANDIDATE}`)) {
      return response({ status: 'ahead', total_commits: 1, commits: [{ sha: CANDIDATE }] });
    }
    if (value.endsWith(`/commits/${CANDIDATE}/pulls`)) return response(MERGED_PR);

    throw new Error(`URL no simulada: ${value}`);
  };
}

assert.strictEqual(policy.classifyCommit({
  prs: [{ number: 7, merged_at: '2026-09-22T00:00:00Z', base: { ref: 'main' } }],
  commit: {},
  targetBranch: 'main'
}).kind, 'merged-pr');

assert.strictEqual(policy.allowedCatalogCommit({
  commit: { message: 'Catálogo desde el panel: 1 cambio(s)' },
  files: [{ filename: 'products-data.js' }, { filename: 'sources/productos/a.webp' }],
  parents: [{ sha: TRUSTED }]
}), true);

assert.strictEqual(policy.allowedCatalogCommit({
  commit: { message: 'Catálogo desde el panel: intento' },
  files: [{ filename: 'app.js' }],
  parents: [{ sha: TRUSTED }]
}), false);

assert.strictEqual(guard.shouldEnforce({ NETLIFY: 'false', CONTEXT: 'production' }), false);
assert.strictEqual(guard.shouldEnforce({ NETLIFY: 'true', CONTEXT: 'deploy-preview' }), false);
assert.strictEqual(meta.resolveCommitRef({ COMMIT_REF: CANDIDATE }), CANDIDATE);
assert.strictEqual(meta.resolveCommitRef({ COMMIT_REF: 'bad', GITHUB_SHA: TRUSTED }), TRUSTED);

(async () => {
  const allowed = await guard.guardProductionDeploy({ env: env(), config: config(), fetchImpl: mockFetch() });
  assert.strictEqual(allowed.allowed, true);
  assert.strictEqual(allowed.verifiedCommits[0].kind, 'merged-pr');

  await assert.rejects(
    () => guard.guardProductionDeploy({ env: env(), config: config(), fetchImpl: mockFetch({ pulls: [] }) }),
    /Commit no autorizado/
  );

  const catalog = await guard.guardProductionDeploy({
    env: env(),
    config: config(),
    fetchImpl: mockFetch({
      pulls: [],
      commit: {
        commit: { message: 'Catálogo desde el panel: 1 cambio(s)' },
        files: [{ filename: 'products-data.js' }],
        parents: [{ sha: TRUSTED }]
      }
    })
  });
  assert.strictEqual(catalog.verifiedCommits[0].kind, 'catalog-panel');

  await assert.rejects(
    () => guard.guardProductionDeploy({ env: { ...env(), GITHUB_TOKEN: '' }, config: config(), fetchImpl: mockFetch() }),
    /Falta GITHUB_TOKEN/
  );

  const verifiedLive = await guard.trustedLiveSha({
    productionUrl: 'https://nutretium.com',
    bootstrapSha: TRUSTED,
    repo: REPO,
    targetBranch: 'main',
    token: 'test-token',
    fetchImpl: verifiedLiveFetch()
  });
  assert.strictEqual(verifiedLive.sha, VERIFIED_LIVE);
  assert.strictEqual(verifiedLive.source, 'published-build-meta-verified');
  assert.strictEqual(verifiedLive.verifiedCommits[0]?.kind, 'merged-pr');

  const fallback = await guard.trustedLiveSha({
    productionUrl: 'https://nutretium.com',
    bootstrapSha: TRUSTED,
    repo: REPO,
    targetBranch: 'main',
    token: 'test-token',
    fetchImpl: async () => response({ error: 'missing' }, 404)
  });
  assert.strictEqual(fallback.sha, TRUSTED);
  assert.strictEqual(fallback.source, 'bootstrap-trust-anchor');

  const recovered = await guard.guardProductionDeploy({
    env: env(),
    config: config(),
    fetchImpl: poisonedRecoveryFetch()
  });
  assert.strictEqual(recovered.allowed, true);
  assert.strictEqual(recovered.trustedSha, TRUSTED, 'un build-meta no autorizado nunca puede convertirse en ancla');
  assert.strictEqual(recovered.trustSource, 'bootstrap-trust-anchor');
  assert.strictEqual(recovered.verifiedCommits[0]?.kind, 'merged-pr');

  console.log(JSON.stringify({ ok: true, suite: 'production-deploy-guard' }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
