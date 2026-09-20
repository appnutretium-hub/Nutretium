'use strict';
// Adaptador exclusivo de test: las pruebas de admin ejercitan ahora el mismo
// contrato que producción: sesión interna de staff en cookie HttpOnly. El
// bootstrap Bearer queda cubierto por sus pruebas específicas y no autoriza
// directamente endpoints administrativos.
process.env.CONTEXT='test';
process.env.URL='http://localhost:8888';
process.env.COMMERCE_LIVE='false';
process.env.REQUIRE_STAFF_MFA='false';
process.env.REQUIRE_STAFF_COOKIE='true';
process.env.REQUIRE_STAFF_CSRF='false';
process.env.REQUIRE_STAFF_STEP_UP='false';

const jwt=require('../netlify/lib/jwt');
const originalSign=jwt.signJWT;
jwt.signJWT=(payload,secret)=>originalSign({...payload,kind:payload?.kind||'staff'},secret);

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