/**
 * netlify/functions/reviews.js
 *
 * GET  /.netlify/functions/reviews?action=list  — fetch all approved reviews
 * POST /.netlify/functions/reviews              — submit a new review
 *
 * Reviews are stored in Netlify Blobs under the "reviews" store.
 */

'use strict';

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SEED_REVIEWS = [
  { id:'r1', author:'Carlos M.', product:'Whey Protein Pro 2kg',    rating:5, text:'La mejor proteína que he probado. Se mezcla perfectamente y el sabor chocolate es increíble.', date:'2026-04-10', approved:true },
  { id:'r2', author:'Laura G.',  product:'Nitro Pre-Workout 300g',  rating:5, text:'Energía brutal desde los 20 minutos. Sin crash posterior. Totalmente recomendado.',             date:'2026-03-28', approved:true },
  { id:'r3', author:'Marcos R.', product:'Creatina Monohidrato 500g',rating:4, text:'Calidad excelente al precio más competitivo del mercado. Notando mejoras en fuerza.',          date:'2026-03-15', approved:true },
];

const { getBlobStore } = require('../lib/blob-store');

async function getStore() {
  return getBlobStore('reviews');
}

async function readReviews() {
  const store = await getStore();
  if (store) {
    const raw = await store.get('all', { type: 'json' }).catch(() => null);
    return raw || null;
  }
  return null;
}

async function writeReviews(reviews) {
  const store = await getStore();
  if (store) await store.setJSON('all', reviews);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // ── GET — list approved reviews ────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    let reviews = await readReviews();
    if (!reviews) {
      reviews = SEED_REVIEWS;
      await writeReviews(reviews);
    }
    const approved = reviews.filter(r => r.approved !== false);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews: approved }) };
  }

  // ── POST — submit review ───────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido.' }) }; }

    if (body.action !== 'submit')
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no reconocida.' }) };

    const { review } = body;
    if (!review?.author || !review?.product || !review?.rating || !review?.text)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Faltan campos obligatorios.' }) };

    if (review.rating < 1 || review.rating > 5)
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valoración inválida.' }) };

    // Sanitize
    const newReview = {
      id:       crypto.randomUUID(),
      author:   String(review.author).slice(0, 60),
      product:  String(review.product).slice(0, 100),
      rating:   Math.round(Number(review.rating)),
      text:     String(review.text).slice(0, 500),
      date:     new Date().toISOString().slice(0, 10),
      approved: true, // auto-approve; set to false for moderation workflow
    };

    let reviews = await readReviews() || [...SEED_REVIEWS];
    reviews.unshift(newReview);
    await writeReviews(reviews);

    return { statusCode: 201, headers: CORS, body: JSON.stringify({ success: true, review: newReview }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
