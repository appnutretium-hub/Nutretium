'use strict';
// Adaptador exclusivo de test. Las pruebas históricas pasan un campo `token`
// al helper local; aquí ese token se transforma en la cookie interna de staff
// ANTES de cargar admin.js. Así conservamos la cobertura del catálogo sin
// reabrir una ruta Bearer en producción.
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

const session=require('../netlify/lib/session');
const originalVerifyStaff=session.verifyStaffEventSession;
session.verifyStaffEventSession=async(event,options={})=>{
  const headers={...(event?.headers||{})};
  const auth=String(headers.authorization||headers.Authorization||'');
  const match=/^Bearer\s+(.+)$/i.exec(auth);
  if(match){
    const existing=String(headers.cookie||headers.Cookie||'').trim();
    headers.cookie=(existing?existing+'; ':'')+`${session.STAFF_COOKIE}=${encodeURIComponent(match[1])}`;
    delete headers.authorization;
    delete headers.Authorization;
  }
  return originalVerifyStaff({...event,headers},{...options,allowBearer:false});
};

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