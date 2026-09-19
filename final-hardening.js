/* NUTRETIUM — Final hardening
   Última capa: elimina UI no respaldada por backend y unifica mensajes. */
(function(){
  'use strict';

  function hideUnsupportedTakeaway(){
    document.querySelectorAll('[onclick*="takeawayModal"]').forEach((btn) => {
      const section = btn.closest('section');
      if (section) section.hidden = true;
      const li = btn.closest('li');
      if (li) li.hidden = true;
    });
    const modal = document.getElementById('takeawayModal');
    if (modal) modal.remove();
  }

  function neutralizeUnsupportedPrograms(){
    try {
      if (typeof INFO_CONTENT !== 'undefined') {
        INFO_CONTENT.afiliacion = {
          title:'Programa de fidelización',
          html:'<p>Actualmente no hay un programa online de puntos o afiliación publicado. Si Nutretium activa uno, sus condiciones se mostrarán aquí antes de poder utilizarlo.</p>'
        };
        INFO_CONTENT.envios = {
          title:'Entrega y recogida',
          html:'<p>Las condiciones concretas de entrega pueden depender del destino y del pedido. Para confirmar cobertura, coste o plazo antes de comprar, contacta con el equipo.</p><p>También puedes consultar disponibilidad de recogida en la tienda física de C/ La Albericia 1, Santander.</p>'
        };
      }
    } catch(_){}
  }

  function replaceVisibleText(){
    const replace = (from,to) => {
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n=>{ if(n.nodeValue && n.nodeValue.includes(from)) n.nodeValue=n.nodeValue.replaceAll(from,to); });
    };
    replace('Lun–Sáb 09:00–21:00','Lun–Sáb 09:30–22:00');
    replace('Lun – Sáb 09:00 – 21:00','Lun – Sáb 09:30 – 22:00');
    replace('Te contactaremos pronto 🎯','Candidatura recibida correctamente.');
  }

  function hardenPaymentCopy(){
    if (typeof paymentOverlayHTML !== 'function') return;
    const original = paymentOverlayHTML;
    paymentOverlayHTML = function(state, order){
      let html = original(state, order);
      html = html.replace('Te enviaremos la confirmación del pedido por email.','Tu pedido ha quedado registrado. Si el servicio de correo transaccional está disponible, recibirás también una confirmación por email.');
      html = html.replace('recibirás la confirmación en breve por email.','puedes consultar el estado desde tu cuenta o contactar con Nutretium.');
      return html;
    };
  }

  function makeExternalLinksSafe(){
    document.querySelectorAll('a[target="_blank"]').forEach(a=>{
      const rel=new Set((a.getAttribute('rel')||'').split(/\s+/).filter(Boolean));
      rel.add('noopener'); rel.add('noreferrer'); a.setAttribute('rel',[...rel].join(' '));
    });
  }

  function handleProductCartReturn(){
    const params=new URLSearchParams(location.search);
    if(params.get('cart')!=='1') return;
    setTimeout(()=>{
      try{
        if(typeof openCart==='function') openCart();
        document.getElementById('products')?.scrollIntoView({behavior:'smooth',block:'start'});
        history.replaceState({},'',location.pathname + (location.hash || ''));
      }catch(_){ /* no rompe la tienda */ }
    },180);
  }

  function init(){
    hideUnsupportedTakeaway();
    neutralizeUnsupportedPrograms();
    replaceVisibleText();
    hardenPaymentCopy();
    makeExternalLinksSafe();
    handleProductCartReturn();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,80),{once:true});
  else setTimeout(init,80);
})();
