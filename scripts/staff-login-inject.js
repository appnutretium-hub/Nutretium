'use strict';
const fs=require('fs');
const files=['admin.html','backoffice.html','settings.html','control.html','ops.html','enterprise.html'];
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
 if(!html.includes('/staff-login-ui.js')){
  const login='<script src="/staff-login-ui.js"></script>';
  html=html.includes('</body>')?html.replace('</body>',login+'</body>'):html+login;
 }
 fs.writeFileSync(file,html);
 console.log('[admin-shell-inject]',file);
}
