'use strict';
const crypto=require('crypto');
const {getBlobStore}=require('../lib/blob-store');
const enterprise=require('../lib/enterprise-store');
const productContent=require('../lib/product-content');
function checksum(snapshot){const copy={...snapshot};delete copy.checksum;return crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex')}
exports.handler=async function(){
 try{
  const backup=getBlobStore('enterprise-backups-v1');if(!backup)throw new Error('Backup store unavailable');
  const snapshot=await enterprise.snapshot();snapshot.productContent=await productContent.list();snapshot.checksum=checksum(snapshot);
  const day=new Date().toISOString().slice(0,10),key=`daily/${day}`;
  await backup.setJSON(key,snapshot);
  const verify=await backup.get(key,{type:'json',consistency:'strong'});
  if(!verify||verify.checksum!==checksum(verify)||verify.checksum!==snapshot.checksum)throw new Error('Backup verification failed');
  const list=await backup.list({prefix:'daily/'});const old=(list.blobs||[]).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,-30);
  await Promise.all(old.map(b=>backup.delete(b.key).catch(()=>{})));
  const enterpriseRecords=Object.values(snapshot.counts||{}).reduce((sum,n)=>sum+Number(n||0),0),productRecords=Array.isArray(snapshot.productContent)?snapshot.productContent.length:0,records=enterpriseRecords+productRecords;
  return{statusCode:200,body:JSON.stringify({ok:true,key,domains:Object.keys(snapshot.domains).length,records,productContent:productRecords,checksum:snapshot.checksum})};
 }catch(err){console.error('[backup]',err);return{statusCode:500,body:JSON.stringify({ok:false,error:'Backup failed'})}}
};