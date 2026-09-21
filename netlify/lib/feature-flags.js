'use strict';
const DEFAULTS=Object.freeze({payments:true,shipping:true,email:true,outbox:true,ai:true,factusol:true,subscriptions:true,marketplace:true});
function envName(name){return `${String(name).trim().toUpperCase()}_ENABLED`;}
function enabled(name,env=process.env){const key=envName(name);if(env[key]===undefined||env[key]==='')return DEFAULTS[name]!==false;return String(env[key]).toLowerCase()==='true';}
function requireEnabled(name,env=process.env){if(enabled(name,env))return true;const error=new Error(`${name} está desactivado temporalmente.`);error.code='FEATURE_DISABLED';error.statusCode=503;throw error;}
function status(env=process.env){return Object.fromEntries(Object.keys(DEFAULTS).map(name=>[name,enabled(name,env)]));}
module.exports={DEFAULTS,envName,enabled,requireEnabled,status};
