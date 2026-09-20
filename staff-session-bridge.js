/* NUTRETIUM — puente Zero Trust de sesión interna.
   El JWT de login se canjea inmediatamente por cookie HttpOnly. Las mutaciones
   internas quedan además ligadas a un token CSRF efímero de la misma sesión. */
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
  let csrfToken=null;
  let csrfPromise=null;

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
      csrfToken=null;
      nativeFetch(SESSION_ENDPOINT,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'}),keepalive:true}).catch(()=>{});
      return;
    }
    return nativeRemove.call(this,key);
  };

  async function exchangeStaffToken(token){
    const exchange=await nativeFetch(SESSION_ENDPOINT,{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'exchange'})
    });
    if(exchange.ok){
      localLogout=false;
      const data=await exchange.clone().json().catch(()=>({}));
      csrfToken=data.csrf||null;
      return null;
    }
    const err=await exchange.json().catch(()=>({error:'No se pudo crear la sesión interna.'}));
    return new Response(JSON.stringify({error:err.error||'No se pudo crear la sesión interna.'}),{status:exchange.status,headers:{'Content-Type':'application/json'}});
  }

  async function ensureCsrf(){
    if(csrfToken)return csrfToken;
    if(csrfPromise)return csrfPromise;
    csrfPromise=(async()=>{
      const r=await nativeFetch(SESSION_ENDPOINT,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status'})});
      if(!r.ok)return null;
      const data=await r.json().catch(()=>({}));
      csrfToken=data.csrf||null;
      return csrfToken;
    })().finally(()=>{csrfPromise=null});
    return csrfPromise;
  }

  function requestUrl(input){try{return new URL(typeof input==='string'?input:input?.url||'',location.href)}catch{return null}}
  function requestMethod(input,init){return String(init?.method||input?.method||'GET').toUpperCase()}
  function needsCsrf(url,method){return Boolean(url&&url.origin===location.origin&&url.pathname.startsWith('/.netlify/functions/')&&!['GET','HEAD','OPTIONS'].includes(method)&&url.pathname!==SESSION_ENDPOINT&&url.pathname!==AUTH_ENDPOINT&&url.pathname!==STAFF_LOGIN_ENDPOINT)}

  window.fetch=async function(input,init={}){
    const url=requestUrl(input),method=requestMethod(input,init);
    let nextInit=init;
    if(needsCsrf(url,method)){
      const csrf=await ensureCsrf().catch(()=>null);
      if(csrf){const headers=new Headers(init?.headers||input?.headers||{});headers.set('X-Nutretium-CSRF',csrf);nextInit={...init,headers,credentials:'same-origin'}}
    }
    const response=await nativeFetch(input,nextInit);
    if(!response.ok)return response;

    const path=url?.pathname||'';
    const isAuthLogin=path===AUTH_ENDPOINT;
    const isStaffLogin=path===STAFF_LOGIN_ENDPOINT;
    if(!isAuthLogin&&!isStaffLogin)return response;
    if(isAuthLogin){let requestBody;try{requestBody=JSON.parse(String(nextInit?.body||'{}'))}catch{return response}if(requestBody.action!=='login')return response}
    let payload;try{payload=await response.clone().json()}catch{return response}
    const token=payload?.user?.token;if(!token)return response;
    const exchangeError=await exchangeStaffToken(token);
    return exchangeError||response;
  };

  window.NutretiumSecurity=Object.freeze({refreshCsrf:async()=>{csrfToken=null;return ensureCsrf()},sessionMarker:()=>MARKER});
})();
