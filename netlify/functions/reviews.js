/**
 * netlify/functions/reviews.js
 *
 * GET  /.netlify/functions/reviews?action=list  — fetch approved reviews
 * POST /.netlify/functions/reviews              — submit a new review for moderation
 *
 * Reviews are stored in Netlify Blobs under the "reviews" store.
 */

'use strict';

const crypto = require('crypto');
const { cabecerasCORS } = require('../lib/cors');
const { getBlobStore } = require('../lib/blob-store');

const CORS = cabecerasCORS('GET, POST, OPTIONS');

async function getStore() {
  return getBlobStore('reviews');
}

async function readReviews() {
  const store = await getStore();
  if (!store) return [];
  const raw = await store.get('all', { type: 'json' }).catch(() => null);
  return Array.isArray(raw) ? raw : [];
}

async function writeReviews(reviews) {
  const store = await getStore();
  if (store) await store.setJSON('all', reviews);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  if (event.httpMethod === 'GET') {
    const reviews = await readReviews();
    const approved = reviews.filter(r => r.approved === true);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ reviews: approved }) };
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido.' }) }; }

    if (body.action !== 'submit') {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no reconocida.' }) };
    }

    const { review } = body;
    if (!review?.author || !review?.product || !review?.rating || !review?.text) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Faltan campos obligatorios.' }) };
    }

    const rating = Math.round(Number(review.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Valoración inválida.' }) };
    }

    const newReview = {
      id: crypto.randomUUID(),
      author: String(review.author).trim().slice(0, 60),
      product: String(review.product).trim().slice(0, 100),
      rating,
      text: String(review.text).trim().slice(0, 500),
      date: new Date().toISOString().slice(0, 10),
      approved: false,
    };

    const reviews = await readReviews();
    reviews.unshift(newReview);
    await writeReviews(reviews);

    return {
      statusCode: 201,
      headers: CORS,
      body: JSON.stringify({
        success: true,
        pendingModeration: true,
        message: 'Gracias. Tu reseña se publicará tras ser revisada.',
      }),
    };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
