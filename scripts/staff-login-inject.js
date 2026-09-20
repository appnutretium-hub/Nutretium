'use strict';
const fs=require('fs');
const files=['admin.html','backoffice.html','settings.html','control.html','ops.html','enterprise.html','admin-center.html','product-editor.html'];
for(const file of files){
 if(!fs.existsSync(file))continue;
 let html=fs.readFileSync(file,'utf8');
 if(!html.includes('/admin-shell.css')){
  const css='<link rel="stylesheet" href="/admin-shell.css">';
  html=html.includes('</head>')?html.replace('</head>',css+'</head>'):css+html;
 }
 if(!html.includes('/admin-shell.js')){
  const shell='<script src="/admin-shell.js"></script>';
  html=html.includes('</body>')?html.replace('</body>',shell+'</body>'):html+shell;
 }
 if(!html.includes('/staff-login-ui.js')&&!['admin-center.html','product-editor.html'].includes(file)){
  const login='<script src="/staff-login-ui.js"></script>';
  html=html.includes('</body>')?html.replace('</body>',login+'</body>'):html+login;
 }
 if(file==='admin.html'&&!html.includes('/admin-product-enhancer.js'))html=html.replace('</body>','<script src="/admin-product-enhancer.js"></script></body>');
 fs.writeFileSync(file,html);
 console.log('[admin-shell-inject]',file);
}
if(fs.existsSync('producto.html')){
 let html=fs.readFileSync('producto.html','utf8');
 if(!html.includes('/product-content-ui.js'))html=html.replace('</body>','<script src="/product-content-ui.js"></script></body>');
 fs.writeFileSync('producto.html',html);
 console.log('[product-content-inject] producto.html');
}