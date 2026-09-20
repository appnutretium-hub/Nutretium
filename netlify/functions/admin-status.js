'use strict';
const {NUTRETIUM_PRODUCTS}=require('../../products-data.js');
const {exigeAdmin,listaAdmins}=require('../lib/admin');
const {cabecerasCORS}=require('../lib/cors');
const {staffConfig}=require('../lib/staff');
const {blobStoreReady}=require('../lib/blob-store');
const CORS=cabecerasCORS('GET, OPTIONS');
const yes=(...names)=>names.every(name=>Boolean(process.env[name]));
const enabled=name=>String(process.env[name]||'').trim().toLowerCase()==='true';
exports.handler=async function(event){
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
  const auth=await exigeAdmin(event);if(!auth.ok)return{statusCode:auth.statusCode,headers:CORS,body:JSON.stringify({error:auth.error})};
  const products=(NUTRETIUM_PRODUCTS||[]).filter(p=>p&&p.active!==false),admins=listaAdmins(),blobs=await blobStoreReady('admin-status-probe');
  const staffMfa=enabled('REQUIRE_STAFF_MFA')&&yes('STAFF_TOTP_SECRETS');
  const services={
    sessions:yes('JWT_SECRET'),staffMfa,payments:yes('REDSYS_SECRET_KEY','REDSYS_MERCHANT_CODE'),email:yes('RESEND_API_KEY'),
    blobs,catalogPublishing:yes('GITHUB_TOKEN'),
    fraudVelocity:!process.env.FRAUD_MAX_CHECKOUTS_15M||blobs,
  };
  const capabilities={
    catalog:{status:'operational',requires:[]},
    orders:{status:services.blobs?'operational':'blocked',requires:services.blobs?[]:['Netlify Blobs runtime access']},
    enterprisePlatform:{status:services.blobs?'operational':'blocked',requires:services.blobs?[]:['Netlify Blobs runtime access']},
    redsys:{status:services.payments?'configured':'blocked',requires:services.payments?[]:['REDSYS_SECRET_KEY','REDSYS_MERCHANT_CODE']},
    transactionalEmail:{status:services.email?'configured':'blocked',requires:services.email?[]:['RESEND_API_KEY']},
    catalogPublishing:{status:services.catalogPublishing?'configured':'blocked',requires:services.catalogPublishing?[]:['GITHUB_TOKEN']},
    carrierLabels:{status:'awaiting_provider',requires:['carrier provider/API credentials']},
    smsPush:{status:'awaiting_provider',requires:['SMS/push provider credentials']},
    recurringPayments:{status:'awaiting_bank_enablement',requires:['Redsys recurring/tokenization merchant enablement']},
    automaticRefunds:{status:'awaiting_bank_enablement',requires:['Redsys refund/merchant operation enablement']},
    marketplaces:{status:'awaiting_channel_credentials',requires:['marketplace credentials per channel']},
    merchantFeed:{status:'operational',requires:[]},
    backups:{status:services.blobs?'operational':'blocked',requires:services.blobs?[]:['Netlify Blobs runtime access']},
    compliance:{status:staffConfig().compliance>0?'configured':'blocked',requires:staffConfig().compliance>0?[]:['COMPLIANCE_EMAILS']},
  };
  const warnings=[];
  if(String(process.env.REDSYS_ENV||'test').toLowerCase()!=='production')warnings.push('Redsys está fuera de producción.');
  if(admins.includes('appnutretium@gmail.com'))warnings.push('La cuenta pública de contacto figura como administradora; conviene usar una cuenta privada.');
  if(!services.staffMfa)warnings.push('MFA de personal no está completamente activado: configura REQUIRE_STAFF_MFA=true y STAFF_TOTP_SECRETS.');
  if(!services.email)warnings.push('Resend no está configurado: la cola de email fallará cerrada.');
  if(!services.blobs)warnings.push('Netlify Blobs no responde desde el runtime: persistencia empresarial bloqueada.');
  if(!services.catalogPublishing)warnings.push('Falta GITHUB_TOKEN: el panel online no puede publicar catálogo.');
  if(staffConfig().compliance===0)warnings.push('Falta COMPLIANCE_EMAILS: ningún producto puede obtener aprobación Food Safety & EU Market Access.');
  return{statusCode:200,headers:{...CORS,'Cache-Control':'no-store'},body:JSON.stringify({
    ok:Object.values(services).every(Boolean),administrator:auth.email,environment:{redsys:String(process.env.REDSYS_ENV||'test').toLowerCase()},
    services,capabilities,staff:staffConfig(),catalog:{activeProducts:products.length,categories:new Set(products.map(p=>p.category).filter(Boolean)).size},warnings,checkedAt:new Date().toISOString()
  })};
};