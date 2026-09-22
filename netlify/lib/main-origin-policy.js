'use strict';

const CATALOG_MESSAGE_PATTERNS = [
  /^Catálogo desde el panel:/,
  /^Categorías actualizadas desde administración/,
  /^Categoría renombrada:/,
  /^Marca renombrada:/
];

function allowedCatalogPath(value) {
  const path = String(value || '');
  return path === 'products-data.js' ||
    path === 'netlify/lib/no-vendibles.js' ||
    /^sources\/productos\//.test(path);
}

function allowedCatalogCommit(commit = {}) {
  const message = String(commit?.commit?.message || '');
  const files = Array.isArray(commit?.files) ? commit.files : [];
  const parents = Array.isArray(commit?.parents) ? commit.parents : [];
  const allowedMessage = CATALOG_MESSAGE_PATTERNS.some(pattern => pattern.test(message));
  return allowedMessage &&
    files.length > 0 &&
    files.every(file => allowedCatalogPath(file?.filename)) &&
    parents.length === 1;
}

function mergedPullRequest(prs = [], targetBranch = 'main') {
  if (!Array.isArray(prs)) return null;
  return prs.find(pr => pr?.merged_at && pr?.base?.ref === targetBranch) || null;
}

function classifyCommit({ prs = [], commit = {}, targetBranch = 'main' } = {}) {
  const pr = mergedPullRequest(prs, targetBranch);
  if (pr) {
    return {
      allowed: true,
      kind: 'merged-pr',
      pullRequest: Number(pr.number) || null
    };
  }
  if (allowedCatalogCommit(commit)) {
    return { allowed: true, kind: 'catalog-panel', pullRequest: null };
  }
  return { allowed: false, kind: 'unauthorized-direct', pullRequest: null };
}

module.exports = {
  CATALOG_MESSAGE_PATTERNS,
  allowedCatalogPath,
  allowedCatalogCommit,
  mergedPullRequest,
  classifyCommit
};
