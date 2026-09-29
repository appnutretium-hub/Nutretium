'use strict';

const SHA_RE = /^[0-9a-f]{40}$/i;
const SITE = 'nutretium.netlify.app';

async function diagnose(expectedSha, fetchImpl = global.fetch) {
  if (!SHA_RE.test(String(expectedSha || ''))) throw new Error('EXPECTED_SHA inválido');
  const url = `https://api.netlify.com/api/v1/sites/${SITE}/deploys?per_page=20`;
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { conclusive: false, reason: `Netlify API HTTP ${response.status}` };
    const deploys = await response.json();
    if (!Array.isArray(deploys)) return { conclusive: false, reason: 'Respuesta Netlify no válida' };
    const deploy = deploys.find(item => item?.commit_ref === expectedSha && item?.branch === 'main');
    if (!deploy) return { conclusive: false, reason: 'Deploy exacto aún no registrado' };
    if (deploy.skipped === true || ['error', 'failed'].includes(deploy.state)) {
      return { conclusive: true, failed: true, state: deploy.state, skipped: deploy.skipped === true, id: deploy.id };
    }
    return { conclusive: true, failed: false, state: deploy.state, id: deploy.id };
  } catch (error) {
    return { conclusive: false, reason: `Netlify API no disponible: ${String(error.message || error).slice(0, 100)}` };
  }
}

if (require.main === module) {
  diagnose(process.env.EXPECTED_SHA).then(result => {
    console.log('[netlify-deploy-diagnostic]', JSON.stringify(result));
    if (result.failed) {
      console.error(`El deploy exacto ${process.env.EXPECTED_SHA} fue ${result.state}${result.skipped ? ' (skipped)' : ''}; revisar configuración y logs de Netlify: https://app.netlify.com/projects/nutretium/deploys/${result.id}`);
      process.exitCode = 2;
    }
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { diagnose };
