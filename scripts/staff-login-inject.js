'use strict';
const fs=require('fs');
const files=['admin.html','backoffice.html','settings.html','control.html','ops.html','enterprise.html','admin-center.html','product-editor.html','catalog-management.html','financial-dashboard.html','customer-center.html'];
const bridgePages=new Set(files);

/**
 * Añade a una página de personal lo que le falte y devuelve el HTML resultante.
 *
 * Se separó de la escritura en disco para que scripts/test-admin-security.js
 * pueda comprobar que el puente de sesión llega a `admin.html` sin necesitar un
 * build previo: la prueba leía el archivo ya inyectado, así que en un clon
 * recién bajado fallaba aunque la inyección fuese correcta.
 */
function inject(file,original){
 let html=String(original);
 if(!html.includes('/admin-shell.css')){
  const css='<link rel="stylesheet" href="/admin-shell.css">';
  html=html.includes('</head>')?html.replace('</head>',css+'</head>'):css+html;
 }
 if(bridgePages.has(file)&&!html.includes('/staff-session-bridge.js')){
  const bridge='<script src="/staff-session-bridge.js"></script>';
  const appScript=file.replace('.html','.js');
  const needle=`<script src="/${appScript}"></script>`;
  if(html.includes(needle))html=html.replace(needle,bridge+'\n'+needle);
  else if(html.includes('</body>'))html=html.replace('</body>',bridge+'</body>');
  else html+=bridge;
 }
 if(!html.includes('/admin-shell.js')){
  const shell='<script src="/admin-shell.js"></script>';
  html=html.includes('</body>')?html.replace('</body>',shell+'</body>'):html+shell;
 }
 if(!html.includes('/staff-login-ui.js')&&!['admin-center.html','product-editor.html','catalog-management.html','financial-dashboard.html','customer-center.html'].includes(file)){
  const login='<script src="/staff-login-ui.js"></script>';
  html=html.includes('</body>')?html.replace('</body>',login+'</body>'):html+login;
 }
 if(file==='admin.html'&&!html.includes('/admin-product-enhancer.js'))html=html.replace('</body>','<script src="/admin-product-enhancer.js"></script></body>');
 if(file==='backoffice.html'&&!html.includes('/backoffice-customer-enhancer.js'))html=html.replace('</body>','<script src="/backoffice-customer-enhancer.js"></script></body>');
 if(file==='admin-center.html'){
  if(!html.includes('/admin-center-hash.js'))html=html.replace('</body>','<script src="/admin-center-hash.js"></script></body>');
  if(!html.includes('/admin-security-enhancer.js'))html=html.replace('</body>','<script src="/admin-security-enhancer.js"></script></body>');
 }
 if(file==='customer-center.html'&&!html.includes('/customer-center-query.js'))html=html.replace('</body>','<script src="/customer-center-query.js"></script></body>');
 return html;
}

function injectFile(file){
 if(!fs.existsSync(file))return false;
 fs.writeFileSync(file,inject(file,fs.readFileSync(file,'utf8')));
 console.log('[admin-shell-inject]',file);
 return true;
}
if(require.main===module){
 for(const file of files)injectFile(file);
 if(fs.existsSync('producto.html')){
  let html=fs.readFileSync('producto.html','utf8');
  if(!html.includes('/product-content-ui.js'))html=html.replace('</body>','<script src="/product-content-ui.js"></script></body>');
  fs.writeFileSync('producto.html',html);
  console.log('[product-content-inject] producto.html');
 }
}

module.exports={files,bridgePages,inject,injectFile};