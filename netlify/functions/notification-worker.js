'use strict';
const enterprise=require('../lib/enterprise-store');
const {sendEmail}=require('../lib/email');
const ACTOR={email:'system@nutretium.local',role:'system'};
function render(template,vars={}){return String(template||'').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,(_,key)=>{const value=key.split('.').reduce((acc,k)=>acc&&acc[k],vars);return value==null?'':String(value);});}
exports.handler=async function(){
  try{
    const jobs=(await enterprise.list('notification-jobs',{limit:250})).filter(j=>j.status==='queued').slice(0,50);
    const templates=await enterprise.list('notification-templates',{limit:250});
    let sent=0,failed=0;
    for(const job of jobs){
      const template=templates.find(t=>t.key===job.templateKey&&t.status==='active');
      if(!template){await enterprise.save('notification-jobs',{...job,status:'failed',error:'template_not_found'},ACTOR,{id:job.id,reason:'notification-worker'});failed++;continue;}
      if(template.channel!=='email'){await enterprise.save('notification-jobs',{...job,status:'failed',error:'channel_provider_not_configured'},ACTOR,{id:job.id,reason:'notification-worker'});failed++;continue;}
      const ok=await sendEmail({to:job.recipient,subject:render(template.subject,job.variables),html:render(template.body,job.variables)});
      await enterprise.save('notification-jobs',{...job,status:ok?'sent':'failed',sentAt:ok?new Date().toISOString():null,error:ok?'':'email_provider_failure'},ACTOR,{id:job.id,reason:'notification-worker'});
      ok?sent++:failed++;
    }
    return{statusCode:200,body:JSON.stringify({ok:true,processed:jobs.length,sent,failed})};
  }catch(error){console.error('[notification-worker]',error);return{statusCode:500,body:JSON.stringify({ok:false,error:'notification_worker_failed'})};}
};
exports._test={render};
