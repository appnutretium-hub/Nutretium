'use strict';
const crypto=require('crypto');
const VALID=/^[A-Za-z0-9_-]{8,120}$/;
function clean(value){const v=String(value||'').trim();return VALID.test(v)?v:'';}
function fromEvent(event={}){const h=event.headers||{};return clean(h['x-nutretium-trace-id']||h['X-Nutretium-Trace-ID']||h['x-nutretium-request']||h['X-Nutretium-Request'])||crypto.randomUUID();}
function headers(traceId){return{'X-Nutretium-Trace-ID':clean(traceId)||crypto.randomUUID()};}
module.exports={VALID,clean,fromEvent,headers};
