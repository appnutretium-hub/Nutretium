/**
 * netlify/functions/products.js
 *
 * GET  /.netlify/functions/products          — list all products
 * POST /.netlify/functions/products          — create / update product (admin)
 *
 * Products are stored in Netlify Blobs under the "products" store.
 * The initial seed is written on first request if the store is empty.
 *
 * Each product object shape:
 * {
 *   id:           number,
 *   name:         string,
 *   category:     string,
 *   price:        number,
 *   badge:        string | null,
 *   badgeColor:   string,
 *   emoji:        string,
 *   customizable: boolean,   ← manager sets this to allow client customization
 *   description:  string,
 *   rating:       number,
 *   reviews:      number,
 *   active:       boolean,
 * }
 */

'use strict';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_PRODUCTS = [
  { id:1,  name:'Whey Protein Pro 2kg',        category:'Proteína',    price:49.99, badge:'Más vendido', badgeColor:'bg-brand-gold text-black',     image:'sources/PROTEINA ISO WHEY.png', emoji:'🥛', customizable:false, description:'Concentrado de suero de leche con 24g de proteína por servicio. Sabor chocolate belga.',                                  rating:4.9, reviews:312, active:true },
  { id:2,  name:'Nitro Pre-Workout 300g',       category:'Pre-Workout', price:34.95, badge:'Nuevo',       badgeColor:'bg-red-600 text-white',       image:'sources/PROTEINA 100% WHEY.png', emoji:'⚡', customizable:false, description:'Fórmula explosiva con cafeína, beta-alanina y citrulina. Máxima energía y foco.',                                          rating:4.7, reviews:189, active:true },
  { id:3,  name:'Creatina Monohidrato 500g',    category:'Creatina',    price:19.99, badge:null,          badgeColor:'',                            image:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop&q=80', emoji:'💪', customizable:false, description:'Creatina micronizada de grado farmacéutico. Aumenta la fuerza y la recuperación muscular.',                                  rating:4.8, reviews:427, active:true },
  { id:4,  name:'Thermo Burn Elite 90 caps',    category:'Fat Burner',  price:39.95, badge:'Oferta',      badgeColor:'bg-yellow-400 text-black',    image:'https://images.unsplash.com/photo-1607619662634-3ac55ec0e216?w=400&h=400&fit=crop&q=80', emoji:'🔥', customizable:false, description:'Termogénico avanzado con extracto de té verde, L-carnitina y capsaicina.',                                                  rating:4.5, reviews:98,  active:true },
  { id:5,  name:'BCAA 2:1:1 Instantized 400g', category:'Aminoácidos', price:27.50, badge:null,          badgeColor:'',                            image:'https://images.unsplash.com/photo-1546519638405-a9f9f3cad1f4?w=400&h=400&fit=crop&q=80', emoji:'🧬', customizable:false, description:'Aminoácidos de cadena ramificada en ratio óptimo 2:1:1. Sabor sandía refrescante.',                                          rating:4.6, reviews:215, active:true },
  { id:6,  name:'Multivitamínico Sport 60 tabs',category:'Vitaminas',   price:22.95, badge:null,          badgeColor:'',                            image:'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop&q=80', emoji:'🌿', customizable:false, description:'Complejo vitamínico y mineral formulado específicamente para deportistas de alto rendimiento.',                               rating:4.7, reviews:143, active:true },
  { id:7,  name:'Camiseta Técnica NUTRETIUM',   category:'Ropa',        price:29.95, badge:'✨ Custom',   badgeColor:'bg-brand-gold text-black',    image:'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=400&fit=crop&q=80', emoji:'👕', customizable:true,  description:'Camiseta técnica de alto rendimiento. Personaliza con tu logo, nombre y colores.',                                          rating:4.8, reviews:64,  active:true },
  { id:8,  name:'Botella Shaker 700ml',         category:'Accesorios',  price:14.95, badge:'✨ Custom',   badgeColor:'bg-brand-gold text-black',    image:'https://images.unsplash.com/photo-1556656793-08538906a9f8?w=400&h=400&fit=crop&q=80', emoji:'🧴', customizable:true,  description:'Shaker premium con filtro anti-grumos. Graba tu logo o nombre en la botella.',                                             rating:4.9, reviews:201, active:true },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getStore() {
  try {
    const { getStore } = require('@netlify/blobs');
    return getStore('products');
  } catch { return null; }
}

async function readProducts() {
  const store = await getStore();
  if (store) {
    const raw = await store.get('catalogue', { type: 'json' }).catch(() => null);
    return raw || null;
  }
  return null;
}

async function writeProducts(products) {
  const store = await getStore();
  if (store) await store.setJSON('catalogue', products);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // ── GET — return product list ──────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    let products = await readProducts();

    // Seed on first run, or re-seed if existing records are missing images
    if (!products || products.some(p => !p.image)) {
      products = SEED_PRODUCTS;
      await writeProducts(products);
    }

    const active = products.filter(p => p.active !== false);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ products: active }) };
  }

  // ── POST — create or update product (manager only) ────────────────────────
  if (event.httpMethod === 'POST') {
    // Basic admin auth: check Authorization header matches ADMIN_SECRET env var
    const adminSecret = process.env.ADMIN_SECRET || 'nutretium-admin-dev';
    const authHeader  = event.headers['authorization'] || '';
    if (authHeader !== `Bearer ${adminSecret}`)
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Acceso denegado.' }) };

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido.' }) }; }

    let products = await readProducts() || [...SEED_PRODUCTS];

    if (body.action === 'upsert') {
      const idx = products.findIndex(p => p.id === body.product.id);
      if (idx >= 0) {
        products[idx] = { ...products[idx], ...body.product };
      } else {
        const newId = Math.max(0, ...products.map(p => p.id)) + 1;
        products.push({ ...body.product, id: newId, active: true });
      }
      await writeProducts(products);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, products }) };
    }

    if (body.action === 'delete') {
      products = products.map(p => p.id === body.id ? { ...p, active: false } : p);
      await writeProducts(products);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no reconocida.' }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};