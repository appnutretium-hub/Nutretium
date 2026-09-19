/* NUTRETIUM — puente de sesión interna.
   En admin/backoffice, el JWT de login se canjea inmediatamente por una cookie
   HttpOnly y nunca se persiste en localStorage. No afecta a la sesión del cliente. */
(function(){
  'use strict';
  if(location.port==='4180')return;

  const KEY='nutretium_user';
  const MARKER=JSON.stringify({token:'http-only-cookie'});
  const AUTH_ENDPOINT='/.netlify/functions/auth';
  const STAFF_LOGIN_ENDPOINT='/.netlify/functions/staff-login';
  const SESSION_ENDPOINT='/.netlify/functions/admin-session';
  const nativeFetch=window.fetch.bind(window);
  const nativeGet=Storage.prototype.getItem;
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;
  let localLogout=false;

  Storage.prototype.getItem=function(key){
    if(this===window.localStorage&&key===KEY)return localLogout?null:MARKER;
    return nativeGet.call(this,key);
  };

  Storage.prototype.setItem=function(key,value){
    if(this===window.localStorage&&key===KEY)return;
    return nativeSet.call(this,key,value);
  };

  Storage.prototype.removeItem=function(key){
    if(this===window.localStorage&&key===KEY){
      localLogout=true;
      nativeFetch(SESSION_ENDPOINT,{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'logout'}),
        keepalive:true
      }).catch(()=>{});
      return;
    }
    return nativeRemove.call(this,key);
  };

  async function exchangeStaffToken(token){
    const exchange=await nativeFetch(SESSION_ENDPOINT,{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({action:'exchange'})
    });

    if(exchange.ok){
      localLogout=false;
      return null;
    }

    const err=await exchange.json().catch(()=>({error:'No se pudo crear la sesión interna.'}));
    return new Response(
      JSON.stringify({error:err.error||'No se pudo crear la sesión interna.'}),
      {status:exchange.status,headers:{'Content-Type':'application/json'}}
    );
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:String(input?.url||'');
    const response=await nativeFetch(input,init);
    if(!response.ok)return response;

    const isAuthLogin=url.includes(AUTH_ENDPOINT);
    const isStaffLogin=url.includes(STAFF_LOGIN_ENDPOINT);
    if(!isAuthLogin&&!isStaffLogin)return response;

    if(isAuthLogin){
      let requestBody;
      try{requestBody=JSON.parse(String(init?.body||'{}'))}catch{return response}
      if(requestBody.action!=='login')return response;
    }

    let payload;
    try{payload=await response.clone().json()}catch{return response}
    const token=payload?.user?.token;
    if(!token)return response;

    const exchangeError=await exchangeStaffToken(token);
    return exchangeError||response;
  };
})();
