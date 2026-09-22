'use strict';

const fs = require('fs');
const path = require('path');
const { classifyCommit } = require('../netlify/lib/main-origin-policy');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'reliability-control-plane.json');
const SHA_RE = /^[0-9a-f]{40}$/i;

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function clean(value) {
  return String(value || '').trim();
}

function isSha(value) {
  return SHA_RE.test(clean(value));
}

function shouldEnforce(env = process.env) {
  return clean(env.NETLIFY).toLowerCase() === 'true' && clean(env.CONTEXT).toLowerCase() === 'production';
}

async function jsonRequest(url, options = {}, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch no está disponible.');
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
  });
  if (!response || response.ok !== true) {
    const body = response && typeof response.text === 'function' ? await response.text().catch(() => '') : '';
    throw new Error(`HTTP ${response?.status || 'error'} en ${url}: ${body.slice(0, 160)}`);
  }
  return response.json();
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'nutretium-production-origin-guard'
  };
}

async function trustedLiveSha({ productionUrl, bootstrapSha, fetchImpl = global.fetch }) {
  const base = clean(productionUrl).replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) throw new Error('productionUrl debe usar HTTPS.');
  try {
    const meta = await jsonRequest(`${base}/build-meta.json?guard=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' }
    }, fetchImpl);
    if (isSha(meta?.commitRef)) return { sha: clean(meta.commitRef), source: 'published-build-meta' };
  } catch (error) {
    console.warn('[deploy-origin-guard] build-meta publicado no disponible:', String(error.message || error).slice(0, 180));
  }
  if (!isSha(bootstrapSha)) throw new Error('No existe un SHA de producción confiable para arrancar el guard.');
  return { sha: clean(bootstrapSha), source: 'bootstrap-trust-anchor' };
}

async function commitOrigin({ repo, sha, targetBranch, token, fetchImpl = global.fetch }) {
  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');
  const headers = githubHeaders(token);
  const pulls = await jsonRequest(`https://api.github.com/repos/${encodedRepo}/commits/${sha}/pulls`, { headers }, fetchImpl);
  const merged = Array.isArray(pulls) && pulls.some(pr => pr?.merged_at && pr?.base?.ref === targetBranch);
  if (merged) return classifyCommit({ prs: pulls, commit: {}, targetBranch });
  const commit = await jsonRequest(`https://api.github.com/repos/${encodedRepo}/commits/${sha}`, { headers }, fetchImpl);
  return classifyCommit({ prs: pulls, commit, targetBranch });
}

async function candidateCommits({ repo, trustedSha, candidateSha, token, fetchImpl = global.fetch }) {
  if (trustedSha === candidateSha) return [];
  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');
  const headers = githubHeaders(token);
  const compare = await jsonRequest(
    `https://api.github.com/repos/${encodedRepo}/compare/${trustedSha}...${candidateSha}?per_page=100&page=1`,
    { headers },
    fetchImpl
  );
  if (!['ahead', 'identical'].includes(String(compare?.status || ''))) {
    throw new Error(`El candidato no desciende del último despliegue confiable (estado: ${compare?.status || 'desconocido'}).`);
  }
  const total = Number(compare?.total_commits || 0);
  const commits = Array.isArray(compare?.commits) ? compare.commits.map(c => clean(c?.sha)).filter(isSha) : [];
  if (total > 100 || commits.length !== total) {
    throw new Error(`La cadena a validar es demasiado grande o incompleta (${commits.length}/${total}); se bloquea el despliegue.`);
  }
  return commits;
}

async function guardProductionDeploy({ env = process.env, fetchImpl = global.fetch, config = readConfig() } = {}) {
  if (!shouldEnforce(env)) return { enforced: false, allowed: true, reason: 'not-production-netlify-build' };

  const targetBranch = clean(env.GITHUB_BRANCH || 'main');
  const branch = clean(env.BRANCH);
  const candidateSha = clean(env.COMMIT_REF);
  const repo = clean(env.GITHUB_REPO || 'appnutretium-hub/Nutretium');
  const token = clean(env.GITHUB_TOKEN);
  const trust = config?.productionTrust || {};

  if (branch !== targetBranch) throw new Error(`El deploy de producción viene de ${branch || '(sin rama)'}, no de ${targetBranch}.`);
  if (!isSha(candidateSha)) throw new Error('COMMIT_REF no contiene un SHA válido.');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('GITHUB_REPO no es válido.');
  if (!token) throw new Error('Falta GITHUB_TOKEN en el entorno de build de Netlify; despliegue bloqueado por seguridad.');

  const encodedRepo = repo.split('/').map(encodeURIComponent).join('/');
  const headers = githubHeaders(token);
  const main = await jsonRequest(`https://api.github.com/repos/${encodedRepo}/branches/${encodeURIComponent(targetBranch)}`, { headers }, fetchImpl);
  const mainSha = clean(main?.commit?.sha);
  if (mainSha !== candidateSha) throw new Error(`El build no corresponde al HEAD actual de ${targetBranch}.`);

  const trusted = await trustedLiveSha({
    productionUrl: trust.productionUrl || 'https://nutretium.com',
    bootstrapSha: trust.bootstrapSha,
    fetchImpl
  });

  const commits = await candidateCommits({ repo, trustedSha: trusted.sha, candidateSha, token, fetchImpl });
  const toVerify = commits.length ? commits : [candidateSha];
  const results = [];
  for (const sha of toVerify) {
    const origin = await commitOrigin({ repo, sha, targetBranch, token, fetchImpl });
    results.push({ sha, ...origin });
    if (!origin.allowed) {
      throw new Error(`Commit no autorizado en la cadena de producción: ${sha} (${origin.kind}).`);
    }
  }

  return {
    enforced: true,
    allowed: true,
    candidateSha,
    trustedSha: trusted.sha,
    trustSource: trusted.source,
    verifiedCommits: results
  };
}

async function main() {
  const result = await guardProductionDeploy();
  console.log('[deploy-origin-guard]', JSON.stringify(result));
}

if (require.main === module) {
  main().catch(error => {
    console.error('[deploy-origin-guard] BLOQUEADO:', error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  isSha,
  shouldEnforce,
  trustedLiveSha,
  commitOrigin,
  candidateCommits,
  guardProductionDeploy
};
