'use strict';
const fs=require('fs');
const budgets={
 'app.js':900*1024,
 'styles.css':1100*1024,
 'index.html':700*1024,
 'producto.js':250*1024,
 'checkout.js':250*1024,
};
const errors=[];for(const[file,max]of Object.entries(budgets)){if(!fs.existsSync(file)){errors.push(`${file} no existe.`);continue}const size=fs.statSync(file).size;if(size>max)errors.push(`${file}: ${(size/1024).toFixed(1)} KB > ${(max/1024).toFixed(0)} KB`);else console.log(`[performance-budget] ${file} ${(size/1024).toFixed(1)} KB / ${(max/1024).toFixed(0)} KB`)}if(errors.length){console.error('[performance-budget] FAIL');errors.forEach(e=>console.error(' - '+e));process.exit(1)}console.log('[performance-budget] OK');
