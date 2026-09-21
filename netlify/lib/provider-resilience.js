'use strict';
const circuits=new Map();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function retryable(error){return error?.code==='PROVIDER_UNAVAILABLE'||error?.providerStatus===429||Number(error?.providerStatus)>=500;}
async function execute(key,operation,{attempts=3,baseDelayMs=150,openAfter=5,cooldownMs=30000}={}){const now=Date.now(),state=circuits.get(key)||{failures:0,openUntil:0};if(state.openUntil>now){const e=new Error('Circuito del proveedor temporalmente abierto.');e.code='CIRCUIT_OPEN';e.statusCode=503;throw e;}let last;for(let attempt=1;attempt<=Math.max(1,attempts);attempt++){try{const value=await operation(attempt);circuits.set(key,{failures:0,openUntil:0});return value;}catch(error){last=error;if(!retryable(error)||attempt>=attempts)break;await wait(Math.min(2000,baseDelayMs*(2**(attempt-1)))+Math.floor(Math.random()*50));}}const failures=state.failures+1;circuits.set(key,{failures,openUntil:failures>=openAfter?Date.now()+cooldownMs:0});throw last;}
function status(){return Object.fromEntries([...circuits].map(([key,v])=>[key,{failures:v.failures,open:v.openUntil>Date.now(),openUntil:v.openUntil||null}]));}
function reset(){circuits.clear();}
module.exports={execute,status,reset,retryable};
