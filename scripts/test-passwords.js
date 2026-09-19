'use strict';
const assert=require('assert');
const crypto=require('crypto');
const passwords=require('../netlify/lib/passwords');

const password='Clave de prueba suficientemente larga 2026!';
const wrong='otra-clave';
const salt=crypto.randomBytes(16).toString('hex');
const legacyHash=crypto.pbkdf2Sync(password,salt,passwords.LEGACY_ITERATIONS,64,'sha512').toString('hex');
const legacy=`${salt}:${legacyHash}`;

const legacyOk=passwords.verifyPassword(password,legacy);
assert.strictEqual(legacyOk.ok,true,'el formato legacy debe seguir autenticando');
assert.strictEqual(legacyOk.needsRehash,true,'el formato legacy debe marcarse para migración');
assert.strictEqual(passwords.verifyPassword(wrong,legacy).ok,false,'una clave incorrecta debe fallar');

const modern=passwords.hashPassword(password);
const parsed=passwords.parseHash(modern);
assert(parsed,'el hash nuevo debe poder analizarse');
assert.strictEqual(parsed.algorithm,passwords.ALGORITHM);
assert.strictEqual(parsed.iterations,passwords.ITERATIONS);
assert.strictEqual(parsed.legacy,false);
const modernOk=passwords.verifyPassword(password,modern);
assert.strictEqual(modernOk.ok,true,'el hash nuevo debe verificar');
assert.strictEqual(modernOk.needsRehash,false,'el hash nuevo no debe remigrarse');

assert.strictEqual(passwords.parseHash('pbkdf2-sha512$99999999$'+salt+'$'+legacyHash),null,'un coste fuera del máximo debe rechazarse sin derivar');
assert.strictEqual(passwords.verifyPassword(password,'basura').ok,false,'un formato inválido debe rechazarse');
assert.notStrictEqual(modern,passwords.hashPassword(password),'dos hashes de la misma clave deben usar sales diferentes');

console.log(`[test-passwords] OK · legacy ${passwords.LEGACY_ITERATIONS} → versionado ${passwords.ITERATIONS} · timing-safe`);
