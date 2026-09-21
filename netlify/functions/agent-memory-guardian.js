'use strict';

const governance=require('../lib/agent-governance');
const safeMemory=require('../lib/agent-safe-memory');
const backup=require('../lib/agent-checkpoint-backup');
const security=require('../lib/agent-memory-security');
const lifecycle=require('../lib/agent-memory-lifecycle');

const signingEnv=()=>({...process.env,AGENT_MEMORY_HMAC_KEY:process.env.AGENT_MEMORY_HMAC_KEY||process.env.JWT_SECRET||''});

exports.handler=async function(){
  const started=Date.now(),budgetMs=22000,batchSize=8;
  try{
    const ids=Object.keys(governance.publicRegistry());
    if(!ids.length)return{statusCode:200,body:JSON.stringify({ok:true,status:'NO_AGENTS'})};
    const day=Math.floor(Date.now()/86400000),start=(day*batchSize)%ids.length,selected=Array.from({length:Math.min(batchSize,ids.length)},(_,i)=>ids[(start+i)%ids.length]);
    const results=[];
    for(const agent of selected){
      if(Date.now()-started>=budgetMs){results.push({agent,status:'BUDGET_STOP'});break;}
      const current=await safeMemory.currentCheckpoint(agent).catch(()=>null);
      if(!current){results.push({agent,status:'NO_CHECKPOINT'});continue;}
      const integrity=await safeMemory.integrity(agent,{depth:5});
      if(!integrity.ok){await security.quarantine(agent,'guardian-primary-integrity-failed',{evidence:integrity.errors});results.push({agent,status:'QUARANTINED',reason:'primary_integrity'});continue;}
      let backupState=await backup.verifyBackup(agent).catch(()=>({ok:false,error:'NO_BACKUP'}));
      if(!backupState.ok){await backup.mirrorChain(agent,{depth:5}).catch(()=>{});backupState=await backup.verifyBackup(agent).catch(e=>({ok:false,error:String(e.message||e)}));}
      if(!backupState.ok){await security.quarantine(agent,'guardian-backup-integrity-failed',{evidence:[backupState.error||'backup_invalid']});results.push({agent,status:'QUARANTINED',reason:'backup_integrity'});continue;}
      let sig=await security.verifySignature(current,signingEnv()).catch(e=>({ok:false,status:'ERROR',error:String(e.message||e)}));
      if(sig.status==='MISSING'||sig.status==='UNCONFIGURED'){
        const created=await security.signCheckpoint(current,signingEnv()).catch(e=>({ok:false,status:'ERROR',error:String(e.message||e)}));
        if(created.ok===true)sig=await security.verifySignature(current,signingEnv());
        else if(created.status==='UNCONFIGURED')sig=created;
      }
      if(sig.ok===false){await security.quarantine(agent,'guardian-signature-failed',{evidence:[sig.status||'signature_invalid']});results.push({agent,status:'QUARANTINED',reason:'signature'});continue;}
      const drill=await lifecycle.recoveryDrill(agent);
      results.push({agent,status:drill.ok?'ACTIVE':'QUARANTINED',signature:sig.status,recovery:drill.status});
    }
    return{statusCode:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:results.every(x=>!['QUARANTINED'].includes(x.status)),checked:results.length,elapsedMs:Date.now()-started,results})};
  }catch(error){
    console.error('[agent-memory-guardian]',error);
    return{statusCode:500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:false,error:'agent_memory_guardian_failed',message:String(error.message||error).slice(0,300)})};
  }
};
