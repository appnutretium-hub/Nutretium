/**
 * NUTRETIUM - animations.js
 * Efectos de movimiento: contadores animados, incremento de clientes al comprar,
 * aparicion al hacer scroll y entrada escalonada de tarjetas.
 */
'use strict';

var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var CLIENTS_BASE = 5000;
var CLIENTS_KEY = 'nutretium_extra_clients';

// Formato de numeros
function formatStat(value, el) {
  var prefix = el.dataset.prefix || '';
  var suffix = el.dataset.suffix || '';
  var num = Math.round(value);
  var text = (el.dataset.format === 'thousands') ? num.toLocaleString('es-ES') : String(num);
  return prefix + text + suffix;
}

// Animacion de conteo
function animateCount(el, to, duration) {
  duration = duration || 1600;
  if (REDUCED) { el.textContent = formatStat(to, el); return; }
  var start = performance.now();
  function tick(now) {
    var t = Math.min((now - start) / duration, 1);
    var eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatStat(to * eased, el);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatStat(to, el);
  }
  requestAnimationFrame(tick);
}

// Contadores del stats bar (al entrar en pantalla)
function initStatCounters() {
  var stats = document.querySelectorAll('.stat-num');
  if (!stats.length) return;

  var clients = document.getElementById('statClients');
  if (clients) {
    var extra = parseInt(localStorage.getItem(CLIENTS_KEY) || '0', 10) || 0;
    clients.dataset.countTo = String(CLIENTS_BASE + extra);
  }

  if (!('IntersectionObserver' in window)) {
    stats.forEach(function (el) { el.textContent = formatStat(parseInt(el.dataset.countTo, 10) || 0, el); });
    return;
  }

  var io = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        animateCount(e.target, parseInt(e.target.dataset.countTo, 10) || 0);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  stats.forEach(function (el) { io.observe(el); });
}

// Incremento de clientes al comprar
function bumpClients(amount) {
  amount = amount || 1;
  var el = document.getElementById('statClients');
  if (!el) return;
  var extra = (parseInt(localStorage.getItem(CLIENTS_KEY) || '0', 10) || 0) + amount;
  localStorage.setItem(CLIENTS_KEY, String(extra));

  var target = CLIENTS_BASE + extra;
  el.dataset.countTo = String(target);

  if (REDUCED) { el.textContent = formatStat(target, el); return; }

  var parent = el.parentElement;
  if (parent) {
    parent.style.position = 'relative';
    var plus = document.createElement('span');
    plus.className = 'stat-plus';
    plus.textContent = '+' + amount;
    parent.appendChild(plus);
    setTimeout(function () { plus.remove(); }, 1200);
  }

  var current = target - amount;
  var start = performance.now();
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  function tick(now) {
    var t = Math.min((now - start) / 700, 1);
    var eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatStat(current + (target - current) * eased, el);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatStat(target, el);
  }
  requestAnimationFrame(tick);
}
window.bumpClients = bumpClients;

// Aparicion al hacer scroll
function initReveal() {
  if (REDUCED) return;
  if (!('IntersectionObserver' in window)) return;
  var selectors = [
    '#categories h2', '#categories p', '.category-card',
    '#novedades h2', '#recomendados h2',
    '#trainer h2', '#trainer .bg-brand-dark',
    '#takeaway h2', '#takeaway .bg-brand-card',
    '#reviews h2', '#reviewsGrid > div',
    '#about h2', '.cert-card',
    '#location h2', '#contact h2',
    '.stats-grid > div'
  ];
  var els = document.querySelectorAll(selectors.join(','));
  if (!els.length) return;

  var io = new IntersectionObserver(function (entries, obs) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  els.forEach(function (el, i) {
    el.classList.add('reveal');
    el.style.transitionDelay = Math.min((i % 6) * 60, 300) + 'ms';
    io.observe(el);
  });
}

// Entrada escalonada de tarjetas
function staggerChildren(container) {
  if (REDUCED || !container) return;
  var kids = container.children;
  for (var i = 0; i < kids.length; i++) {
    kids[i].style.animation = 'fadeInUp 0.45s ease both';
    kids[i].style.animationDelay = Math.min(i * 25, 350) + 'ms';
  }
}

function initCardFade() {
  if (REDUCED) return;
  ['productGrid', 'novedadesGrid', 'recomendadosGrid'].forEach(function (id) {
    var grid = document.getElementById(id);
    if (!grid) return;
    staggerChildren(grid);
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function () { staggerChildren(grid); });
    mo.observe(grid, { childList: true });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initStatCounters();
  initReveal();
  initCardFade();
});
