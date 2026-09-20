/* NUTRETIUM — Customer Session Hardening
   Final build layer. Keeps only non-secret profile data in browser storage and
   uses the HttpOnly server session as the authentication source of truth. */
(function(){
  'use strict';
  const STORAGE_KEY='nutretium_user';

  function publicProfile(user){
    if(!user||typeof user!=='object')return null;
    const copy={...user};
    delete copy.token;
    delete copy.accessToken;
    delete copy.refreshToken;
    return copy;
  }
  function persistProfile(user){
    try{
      if(user)localStorage.setItem(STORAGE_KEY,JSON.stringify(user));
      else localStorage.removeItem(STORAGE_KEY);
    }catch{}
  }

  saveSession=function(user){
    currentUser=publicProfile(user);
    persistProfile(currentUser);
  };

  loadSession=function(){
    let legacyToken=null;
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      const parsed=raw?JSON.parse(raw):null;
      legacyToken=parsed&&typeof parsed.token==='string'?parsed.token:null;
      currentUser=publicProfile(parsed);
      persistProfile(currentUser);
    }catch{
      currentUser=null;
      persistProfile(null);
    }

    Promise.resolve().then(async()=>{
      try{
        const body={action:'profile'};
        if(legacyToken)body.token=legacyToken;
        const res=await fetch('/.netlify/functions/auth',{
          method:'POST',
          credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body),
        });
        if(res.ok){
          const data=await res.json();
          saveSession(data.user);
          if(typeof updateAuthUI==='function')updateAuthUI();
          return;
        }
        if(res.status===401||res.status===404){
          clearSession();
          if(typeof updateAuthUI==='function')updateAuthUI();
        }
      }catch{
        // Un fallo de red no borra el perfil local. La autorización real sigue
        // dependiendo del servidor, que rechazará cualquier operación protegida.
      }
    });
  };

  const clearLocalSession=clearSession;
  clearSession=function(){
    clearLocalSession();
    persistProfile(null);
  };

  logout=function(){
    fetch('/.netlify/functions/auth',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'logout'}),
      keepalive:true,
    }).catch(()=>{});
    clearSession();
    if(typeof updateAuthUI==='function')updateAuthUI();
    if(typeof closeProfileDropdown==='function')closeProfileDropdown();
    if(typeof showToast==='function')showToast('Sesión cerrada.');
  };

  window.NUTRETIUM_CUSTOMER_SESSION={
    transport:'httponly-cookie',
    storage:'profile-only',
    version:2,
  };
})();
