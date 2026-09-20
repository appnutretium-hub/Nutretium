/* NUTRETIUM — multimedia adicional de ficha de producto */
(function(){
  'use strict';

  const esc=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function productIdFromPath(){
    const last=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
    const match=last.match(/-(\d+)$/);
    return match?Number(match[1]):Number(new URLSearchParams(location.search).get('id'));
  }
  function safeMediaUrl(value){
    const raw=String(value||'').trim();
    if(!raw)return null;
    if(raw.startsWith('/'))return raw;
    try{const u=new URL(raw,location.origin);return u.protocol==='https:'?u.href:null}catch{return null}
  }
  async function load(){
    const productId=productIdFromPath();
    const app=document.getElementById('app');
    if(!Number.isFinite(productId)||!app||document.getElementById('ntProductVideos'))return;
    try{
      const response=await fetch('/.netlify/functions/product-options?productId='+encodeURIComponent(productId),{headers:{Accept:'application/json'}});
      if(!response.ok)return;
      const data=await response.json();
      const videos=(Array.isArray(data.media)?data.media:[])
        .filter(item=>item&&item.kind==='video')
        .map(item=>({url:safeMediaUrl(item.url),alt:String(item.alt||'Vídeo del producto')}))
        .filter(item=>item.url)
        .slice(0,4);
      if(!videos.length)return;

      const related=document.querySelector('.related');
      const section=document.createElement('section');
      section.id='ntProductVideos';
      section.className='details';
      section.innerHTML=`<div class="section-head"><div><h2>Vídeo del producto</h2><p>Contenido multimedia asociado a esta referencia.</p></div></div><div class="nt-video-grid">${videos.map((video,index)=>`<figure class="nt-video-card"><video controls playsinline preload="metadata" aria-label="${esc(video.alt)}"><source src="${esc(video.url)}"></video><figcaption>${esc(video.alt||`Vídeo ${index+1}`)}</figcaption></figure>`).join('')}</div>`;
      const style=document.createElement('style');
      style.textContent='.nt-video-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.nt-video-card{margin:0;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;background:#111}.nt-video-card video{display:block;width:100%;aspect-ratio:16/9;background:#050505}.nt-video-card figcaption{padding:10px 12px;color:#969188;font-size:.75rem}@media(max-width:700px){.nt-video-grid{grid-template-columns:1fr}}';
      document.head.appendChild(style);
      if(related)related.insertAdjacentElement('beforebegin',section);else app.appendChild(section);
    }catch(error){console.warn('[product-media]',error?.message||error)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
