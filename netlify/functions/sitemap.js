'use strict';
const {NUTRETIUM_PRODUCTS,NUTRETIUM_CATEGORIES}=require('../../products-data.js');
const {buildSitemap}=require('../lib/seo');
exports.handler=async function(){const xml=buildSitemap({baseUrl:'https://nutretium.com',products:NUTRETIUM_PRODUCTS||[],categories:NUTRETIUM_CATEGORIES||[]});return{statusCode:200,headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=900, s-maxage=3600','X-Content-Type-Options':'nosniff'},body:xml};};
