'use strict';
const enterprise=require('./enterprise-store');
const productContent=require('./product-content');
const integrity=require('./backup-integrity');
async function build(){const snapshot=await enterprise.snapshot();snapshot.productContent=await productContent.list();return integrity.seal(snapshot)}
function summary(snapshot){const enterpriseRecords=Object.values(snapshot.counts||{}).reduce((sum,n)=>sum+Number(n||0),0),productRecords=Array.isArray(snapshot.productContent)?snapshot.productContent.length:0;return{domains:Object.keys(snapshot.domains||{}).length,records:enterpriseRecords+productRecords,productContent:productRecords,checksum:snapshot.checksum||snapshot.integrity?.checksum||null,backupVersion:Number(snapshot.backupVersion||1)}}
module.exports={build,summary};
