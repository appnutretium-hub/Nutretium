'use strict';
const assert = require('assert');
const { FactusolClient, normalizeRows } = require('../netlify/lib/factusol-client');
const { FactusolCommerce } = require('../netlify/lib/factusol-commerce');
const vault = require('../netlify/lib/factusol-vault');

function response(body,status=200){return{ok:status>=200&&status<300,status,async json(){return body}}}
function mockApi(){
  return async (url,opts={})=>{
    const body=JSON.parse(opts.body||'{}');
    if(String(url).endsWith('/login/Autenticar')){
      assert.equal(body.codigoFabricante,2020);
      assert.equal(body.codigoCliente,123456);
      assert.equal(body.baseDatosCliente,'3FS999');
      assert.equal(Buffer.from(body.password,'base64').toString('utf8'),'secret');
      return response({respuesta:'OK',resultado:'header.eyJleHAiOjQ3MDAwMDAwMDB9.sig'});
    }
    if(String(url).endsWith('/admin/LanzarConsulta')){
      assert.ok(String(opts.headers.Authorization||'').startsWith('Bearer '));
      const q=String(body.consulta||'');
      if(q.includes('FROM F_ART'))return response({respuesta:'OK',resultado:[[{columna:'CODART',dato:'SKU1'},{columna:'CCOART',dato:'Producto 1'},{columna:'DESART',dato:'Producto 1'},{columna:'EANART',dato:'123'},{columna:'FAMART',dato:'SUP'},{columna:'NPUART',dato:0}]]});
      if(q.includes('FROM F_LTA'))return response({respuesta:'OK',resultado:[[{columna:'ARTLTA',dato:'SKU1'},{columna:'TARLTA',dato:'1'},{columna:'PRELTA',dato:19.90}]]});
      if(q.includes('FROM F_STO'))return response({respuesta:'OK',resultado:[[{columna:'ARTSTO',dato:'SKU1'},{columna:'ALMSTO',dato:'GEN'},{columna:'ACTSTO',dato:5},{columna:'DISSTO',dato:4},{columna:'MINSTO',dato:1},{columna:'MAXSTO',dato:10}]]});
      if(q.includes('FROM F_ALM'))return response({respuesta:'OK',resultado:[[{columna:'CODALM',dato:'GEN'},{columna:'NOMALM',dato:'General'}]]});
      if(q.includes('FROM F_TAR'))return response({respuesta:'OK',resultado:[[{columna:'CODTAR',dato:'1'},{columna:'DESTAR',dato:'PVP'}]]});
      return response({respuesta:'OK',resultado:[]});
    }
    throw new Error('URL inesperada '+url);
  };
}

(async()=>{
  const rows=normalizeRows([[{columna:'A',dato:1},{columna:'B',dato:'x'}]]);
  assert.deepEqual(rows,[{A:1,B:'x'}]);

  const config={manufacturerCode:'2020',clientCode:'123456',database:'3FS999',password:'secret',exercise:'2026',warehouseCodes:'GEN',tariffCode:'1',liveEnabled:true,writeEnabled:false};
  const client=new FactusolClient({config,fetchImpl:mockApi()});
  assert.equal(client.readiness().ready,true);
  const health=await client.health();
  assert.equal(health.ok,true);

  const commerce=new FactusolCommerce({config,fetchImpl:mockApi()});
  assert.equal(commerce.readiness().liveCatalogReady,true);
  const items=await commerce.fetchByCodes(['SKU1']);
  assert.equal(items.length,1);
  assert.equal(items[0].price,19.9);
  assert.equal(items[0].available,4);
  assert.equal((await commerce.validateCart([{code:'SKU1',qty:4}])).ok,true);
  const shortage=await commerce.validateCart([{code:'SKU1',qty:5}]);
  assert.equal(shortage.ok,false);
  assert.equal(shortage.problems[0].reason,'insufficient-stock');

  process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
  process.env.CONFIG_VAULT_KEY='test-key-not-production';
  await vault.write({manufacturerCode:'2020',clientCode:'123456',database:'3FS999',password:'secret',exercise:'2026',warehouseCodes:'GEN',tariffCode:'1',liveEnabled:false,writeEnabled:false});
  const saved=await vault.read();
  assert.equal(saved.manufacturerCode,'2020');
  assert.equal(saved.password,'secret');
  assert.equal(saved.exercise,'2026');
  const status=await vault.status();
  assert.equal(status.passwordConfigured,true);
  assert.equal(status.exerciseConfigured,true);
  await vault.clear();
  assert.equal(await vault.read(),null);

  console.log('FACTUSOL integration contracts: OK');
})().catch(err=>{console.error(err);process.exit(1)});
