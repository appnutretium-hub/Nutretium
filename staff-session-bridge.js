/* NUTRETIUM — puente de sesión interna.
   En admin/backoffice, el JWT de login se canjea inmediatamente por una cookie
   HttpOnly y nunca se persiste en localStorage. No afecta a la sesión del cliente. */
(function(){
  'use strict';
  if (location.port === '4180') return; // panel local de desarrollo
  const KEY='nutretium_user';
  const nativeFetch=window.fetch.bind(window);
  const nativeGet=Storage.prototype.getItem;
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;

  Storage.prototype.getItem=function(key){
    if(this===window.localStorage&&key===KEY)return null;
    return nativeGet.call(this,key);
  };
  Storage.prototype.setItem=function(key,value){
    if(this===window.localStorage&&key===KEY)return;
    return nativeSet.call(this,key,value);
  };
  Storage.prototype.removeItem=function(key){
    if(this===window.localStorage&&key===KEY){
      nativeFetch('/.netlify/functions/admin-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'}),keepalive:true}).catch(()=>{});
      return;
    }
    return nativeRemove.call(this,key);
  };

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const response=await nativeFetch(input,init);
    if(!url.includes('/.netlify/functions/auth')||!response.ok)return response;
    let requestBody=null;
    try{requestBody=JSON.parse(String(init?.body||'{}'))}catch{return response;}
    if(requestBody.action!=='login')return response;
    let payload;try{payload=await response.clone().json()}catch{return response;}
    const token=payload?.user?.token;if(!token)return response;
    const exchange=await nativeFetch('/.netlify/functions/admin-session',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({action:'exchange'})
    });
    if(exchange.ok)return response;
    const err=await exchange.json().catch(()=>({error:'No se pudo crear la sesión interna.'}));
    return new Response(JSON.stringify({error:err.error||'No se pudo crear la sesión interna.'}),{status:exchange.status,headers:{'Content-Type':'application/json'}});
  };
})();
