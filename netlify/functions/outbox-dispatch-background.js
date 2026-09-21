'use strict';
const auth=require('../lib/internal-auth');
const dispatch=require('../lib/outbox-dispatch');
const {record}=require('../lib/observability');
exports.handler=async event=>{if(event.httpMethod!=='POST')return{statusCode:405,body:''};const verified=auth.verify(event,'outbox-dispatch');if(!verified.ok){await record('outbox_background_denied',{severity:'warning',source:'outbox-dispatch-background',message:verified.error}).catch(()=>{});return{statusCode:403,body:''};}try{await dispatch.drain(50);return{statusCode:202,body:''};}catch(err){await record('outbox_background_failure',{severity:'high',source:'outbox-dispatch-background',message:String(err.message||err)}).catch(()=>{});throw err;}};
