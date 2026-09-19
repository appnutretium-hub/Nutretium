/* NUTRETIUM — performance runtime sin alterar catálogo */
(function(){'use strict';
function tuneImages(root=document){const imgs=[...root.querySelectorAll('img')];imgs.forEach((img,i)=>{if(!img.hasAttribute('decoding'))img.decoding='async';if(i>1&&!img.hasAttribute('loading'))img.loading='lazy';if(!img.hasAttribute('fetchpriority')&&i>2)img.fetchPriority='low'});}
function init(){tuneImages();window.addEventListener('nt:products-rendered',()=>requestAnimationFrame(()=>tuneImages(document.getElementById('productGrid')||document)))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();