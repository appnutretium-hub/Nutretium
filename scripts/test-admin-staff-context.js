'use strict';
// Adaptador exclusivo de test: las pruebas históricas de admin fabricaban JWT
// genéricos antes de que existiera separación client/staff. Conservamos toda su
// cobertura de catálogo, pero hacemos que esos JWT representen staff-login real.
const jwt=require('../netlify/lib/jwt');
const originalSign=jwt.signJWT;
jwt.signJWT=(payload,secret)=>originalSign({...payload,kind:payload?.kind||'staff-login'},secret);

const root=globalThis.__NUTRETIUM_TEST_BLOBS__||(globalThis.__NUTRETIUM_TEST_BLOBS__=new Map());
const users=root.get('users')||new Map();
root.set('users',users);
for(const email of ['jefa@nutretium.com','cliente@example.com','otra@nutretium.com']){
  if(!users.has(email))users.set(email,{id:`test-${email}`,email,name:'Test',surname:'Admin',tokensValidAfter:0});
}
const etags=globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__||(globalThis.__NUTRETIUM_TEST_BLOB_ETAGS__=new Map());
const userEtags=etags.get('users')||new Map();
etags.set('users',userEtags);
for(const email of users.keys())if(!userEtags.has(email))userEtags.set(email,'"test-user"');