'use strict';

const crypto = require('crypto');
const { getBlobStore } = require('./blob-store');
const { domains } = require('./enterprise-schema');
const { CURRENT_SCHEMA_VERSION } = require('./data-migrations');

const STORE = 'enterprise-platform-v1';
const AUDIT = 'enterprise-audit-v1';
const MAX_LIST = 1000;
const READ_BATCH = 100;

function storeOrThrow(name = STORE) {const store = getBlobStore(name);if (!store) { const err = new Error('Almacenamiento empresarial no disponible.'); err.code = 'STORE_UNAVAILABLE'; throw err; }return store;}
const safeId = value => String(value || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120);
const keyFor = (domain, id) => `${domain}/${safeId(id)}`;
async function get(domain, id) {const store = storeOrThrow();return store.get(keyFor(domain, id), { type:'json', consistency:'strong' }).catch(() => null);}
async function readRows(store, blobs) {const rows = [];for (let start = 0; start < blobs.length; start += READ_BATCH) {const batch = blobs.slice(start, start + READ_BATCH);const values = await Promise.all(batch.map(b => store.get(b.key, { type:'json', consistency:'strong' }).catch(() => null)));rows.push(...values.filter(Boolean));}return rows;}
function orderRows(rows, includeArchived) {return rows.filter(r => includeArchived || !r.archivedAt).sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));}
async function list(domain, { includeArchived = false, limit = 500 } = {}) {const store = storeOrThrow();const result = await store.list({ prefix:`${domain}/` });const blobs = (result.blobs || []).slice(0, Math.min(Number(limit) || 500, MAX_LIST));return orderRows(await readRows(store, blobs), includeArchived);}
async function listAll(domain, { includeArchived = false } = {}) {const store = storeOrThrow();const result = await store.list({ prefix:`${domain}/` });return orderRows(await readRows(store, result.blobs || []), includeArchived);}
async function audit(actor, action, domain, id, detail = {}) {const store = storeOrThrow(AUDIT),now = new Date().toISOString(),record = { id:crypto.randomUUID(), at:now, actor:actor.email, role:actor.role, action, domain, recordId:id, detail },key = `event/${now.replace(/[:.]/g,'-')}/${record.id}`;await store.setJSON(key, record, { onlyIfNew:true });return record;}
async function save(domain, raw, actor, { id, reason = '', create = false } = {}) {const store = storeOrThrow(),recordId = safeId(id || raw.id || crypto.randomUUID()),previous = await get(domain, recordId);if (create && previous) { const err = new Error('Ya existe un registro con ese identificador.'); err.code = 'CONFLICT'; throw err; }const now = new Date().toISOString(),next = {...(previous || {}), ...raw,id: recordId,version: Number((previous && previous.version) || 0) + 1,createdAt: (previous && previous.createdAt) || now,createdBy: (previous && previous.createdBy) || actor.email,updatedAt: now,updatedBy: actor.email};await store.setJSON(keyFor(domain, recordId), next);await audit(actor, previous ? 'update' : 'create', domain, recordId, { reason, version:next.version });return next;}
async function archive(domain, id, actor, reason = '') {const previous = await get(domain, id);if (!previous) return null;const next = { ...previous, archivedAt:new Date().toISOString(), archivedBy:actor.email, updatedAt:new Date().toISOString(), updatedBy:actor.email, version:Number(previous.version || 0)+1 },store = storeOrThrow();await store.setJSON(keyFor(domain, id), next);await audit(actor, 'archive', domain, id, { reason, version:next.version });return next;}
async function auditList({ domain, recordId, limit = 200 } = {}) {const store = storeOrThrow(AUDIT),result = await store.list({ prefix:'event/' }),keys = (result.blobs || []).slice(-Math.min(Number(limit) || 200, 1000)).reverse(),rows = (await Promise.all(keys.map(b => store.get(b.key, {type:'json', consistency:'strong'}).catch(() => null)))).filter(Boolean);return rows.filter(r => (!domain || r.domain === domain) && (!recordId || r.recordId === recordId));}
async function snapshot() {const out = { schemaVersion:CURRENT_SCHEMA_VERSION, generatedAt:new Date().toISOString(), domains:{}, counts:{} };for (const domain of domains()) {const rows = await listAll(domain, { includeArchived:true });out.domains[domain] = rows;out.counts[domain] = rows.length;}return out;}
module.exports = { STORE, AUDIT, safeId, keyFor, get, list, listAll, save, archive, audit, auditList, snapshot };
