'use strict';

const enterprise = require('../lib/enterprise-store');
const { sendEmail } = require('../lib/email');
const provider = require('../lib/provider-client');
const ACTOR = { email: 'system@nutretium.local', role: 'system' };

function render(template, vars = {}) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = key.split('.').reduce((acc, item) => acc && acc[item], vars);
    return value == null ? '' : String(value);
  });
}

async function sendChannel(template, job) {
  const subject = render(template.subject, job.variables);
  const body = render(template.body, job.variables);
  if (template.channel === 'email') return { ok: await sendEmail({ to: job.recipient, subject, html: body }), provider: 'email' };
  const prefixes = { sms: 'SMS_PROVIDER', whatsapp: 'WHATSAPP_PROVIDER', push: 'PUSH_PROVIDER' };
  const prefix = prefixes[template.channel];
  if (!prefix) return { ok: false, error: 'unsupported_channel' };
  const data = await provider.request(prefix, 'messages', { channel: template.channel, to: job.recipient, subject, body, metadata: { jobId: job.id, templateKey: job.templateKey } }, { idempotencyKey: `notification:${job.id}` });
  return { ok: ['accepted', 'queued', 'sent', 'delivered'].includes(String(data.status || 'accepted').toLowerCase()), provider: data.provider || prefix.toLowerCase(), providerMessageId: data.id || data.messageId || null };
}

// Comparación en tiempo constante: con !== se puede ir adivinando el secreto
// carácter a carácter midiendo cuánto tarda en fallar.
function mismoSecreto(recibido, esperado) {
  const a = Buffer.from(String(recibido || '')), b = Buffer.from(String(esperado));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

exports.handler = async function (event = {}) {
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && !mismoSecreto(event.headers?.['x-nutretium-cron'], cronSecret)) return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  try {
    const jobs = (await enterprise.list('notification-jobs', { limit: 250 })).filter(job => job.status === 'queued').slice(0, 50);
    const templates = await enterprise.list('notification-templates', { limit: 250 });
    let sent = 0, failed = 0;
    for (const job of jobs) {
      const template = templates.find(item => item.key === job.templateKey && item.status === 'active');
      if (!template) { await enterprise.save('notification-jobs', { ...job, status: 'failed', error: 'template_not_found' }, ACTOR, { id: job.id, reason: 'notification-worker' }); failed++; continue; }
      let result;
      try { result = await sendChannel(template, job); } catch (error) { result = { ok: false, error: error.code || 'provider_failure' }; }
      await enterprise.save('notification-jobs', { ...job, status: result.ok ? 'sent' : 'failed', sentAt: result.ok ? new Date().toISOString() : null, error: result.ok ? '' : (result.error || 'provider_failure'), provider: result.provider || null, providerMessageId: result.providerMessageId || null }, ACTOR, { id: job.id, reason: 'notification-worker' });
      result.ok ? sent++ : failed++;
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed: jobs.length, sent, failed }) };
  } catch (error) { console.error('[notification-worker]', error); return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'notification_worker_failed' }) }; }
};

exports._test = { render, sendChannel };
