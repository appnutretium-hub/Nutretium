'use strict';
const assert=require('assert');
const {slugify,escapeXml,productPath,categoryPath,buildSitemap}=require('../netlify/lib/seo');
let tests=0;function test(name,fn){try{fn();tests+=1;console.log('✓',name);}catch(err){console.error('✗',name);throw err;}}
test('slugify normaliza tildes y espacios',()=>assert.strictEqual(slugify('Proteínas y Salud'),'proteinas-y-salud'));
test('slugify elimina símbolos peligrosos',()=>assert.strictEqual(slugify('Whey <80%> / CFM'),'whey-80-cfm'));
test('productPath termina en id estable',()=>assert.strictEqual(productPath({id:42,name:'Creatina Premium'}),'/producto/creatina-premium-42'));
test('categoryPath genera URL limpia',()=>assert.strictEqual(categoryPath('Pre-entrenos'),'/categoria/pre-entrenos'));
test('escapeXml escapa entidades XML',()=>assert.strictEqual(escapeXml('A & B < C'),'A &amp; B &lt; C'));
test('sitemap incluye home categorías y productos activos',()=>{const xml=buildSitemap({baseUrl:'https://nutretium.com/',categories:['Proteínas'],products:[{id:1,name:'Whey Gold',active:true},{id:2,name:'Oculto',active:false}]});assert(xml.includes('<loc>https://nutretium.com/</loc>'));assert(xml.includes('<loc>https://nutretium.com/categoria/proteinas</loc>'));assert(xml.includes('<loc>https://nutretium.com/producto/whey-gold-1</loc>'));assert(!xml.includes('oculto-2'));});
test('sitemap elimina URLs duplicadas',()=>{const xml=buildSitemap({categories:['Creatinas','Creatinas'],products:[]});assert.strictEqual((xml.match(/categoria\/creatinas/g)||[]).length,1);});
test('sitemap marca featured con prioridad superior',()=>{const xml=buildSitemap({products:[{id:7,name:'Top',active:true,featured:true}]});const block=xml.split('<url>').find((x)=>x.includes('/top-7'));assert(block.includes('<priority>0.8</priority>'));});
console.log(`\n${tests} pruebas commerce superadas.`);
