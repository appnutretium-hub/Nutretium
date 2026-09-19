/* NUTRETIUM — production finish
   Accesibilidad de overlays + validación cliente de formularios críticos. */
(function(){
'use strict';
const emailOk=(v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
const urlOk=(v)=>{if(!String(v||'').trim())return true;try{const u=new URL(String(v).trim());return u.protocol==='https:'||u.protocol==='http:'}catch{return false}};
let lastFocus=null;

function visibleFocusable(root){
  return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(el=>el.offsetParent!==null&&!el.hidden);
}
function activateOverlay(root){
  if(!root||root.dataset.ntA11yActive==='1')return;
  root.dataset.ntA11yActive='1';lastFocus=document.activeElement;
  const items=visibleFocusable(root);(items[0]||root).focus?.();
}
function deactivateOverlay(root){
  if(!root)return;delete root.dataset.ntA11yActive;
  if(lastFocus?.focus)lastFocus.focus();lastFocus=null;
}

document.addEventListener('keydown',(e)=>{
  const overlay=document.querySelector('#ntMobileFilters.open,.modal-backdrop.open');
  if(!overlay)return;
  if(e.key==='Escape'){
    e.preventDefault();
    if(overlay.id==='ntMobileFilters') overlay.querySelector('[data-mf-close]')?.click();
    else if(typeof closeModal==='function') closeModal(overlay.id);
    deactivateOverlay(overlay);return;
  }
  if(e.key!=='Tab')return;
  const items=visibleFocusable(overlay);if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
},true);

const observer=new MutationObserver(()=>{
  document.querySelectorAll('#ntMobileFilters.open,.modal-backdrop.open').forEach(activateOverlay);
  document.querySelectorAll('[data-nt-a11y-active="1"]:not(.open)').forEach(deactivateOverlay);
});
observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});

function installValidators(){
  const oldTrainer=window.submitTrainerRequest;
  if(typeof oldTrainer==='function'&&!oldTrainer.__ntValidated){
    const wrapped=async function(){
      const email=document.getElementById('trainerEmail')?.value||'';
      const err=document.getElementById('trainerError');
      if(!emailOk(email)){if(typeof showFieldError==='function')showFieldError(err,'Introduce un email válido.');return;}
      return oldTrainer.apply(this,arguments);
    };wrapped.__ntValidated=true;window.submitTrainerRequest=wrapped;
  }
  const oldCareer=window.submitCareerApplication;
  if(typeof oldCareer==='function'&&!oldCareer.__ntValidated){
    const wrapped=async function(){
      const email=document.getElementById('careerEmail')?.value||'';
      const link=document.getElementById('careerLink')?.value||'';
      const err=document.getElementById('careerError');
      if(!emailOk(email)){if(typeof showFieldError==='function')showFieldError(err,'Introduce un email válido.');return;}
      if(!urlOk(link)){if(typeof showFieldError==='function')showFieldError(err,'El enlace de CV/LinkedIn debe empezar por http:// o https://.');return;}
      return oldCareer.apply(this,arguments);
    };wrapped.__ntValidated=true;window.submitCareerApplication=wrapped;
  }
}

function improveExternalLinks(){
  document.querySelectorAll('a[target="_blank"]').forEach(a=>{
    const rel=new Set((a.rel||'').split(/\s+/).filter(Boolean));rel.add('noopener');rel.add('noreferrer');a.rel=[...rel].join(' ');
  });
}
function init(){installValidators();improveExternalLinks();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,320),{once:true});else setTimeout(init,320);
})();
