'use strict';
const dispatch=require('../lib/outbox-dispatch');
const {record}=require('../lib/observability');
exports.handler=async function(){try{const summary=await dispatch.drain(50);return{statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:true,...summary})};}catch(err){await record('outbox_worker_failure',{severity:'high',source:'outbox-worker',message:String(err.message||err)}).catch(()=>{});return{statusCode:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ok:false,error:'Outbox worker failed'})};}};
exports._test={execute:dispatch.execute,orderEmail:dispatch.orderEmail,drain:dispatch.drain};
