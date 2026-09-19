'use strict';
const {cabecerasCORS}=require('../lib/cors');
const settings=require('../lib/settings');
const CORS=cabecerasCORS('GET, OPTIONS');
exports.handler=async function(event){
 if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
 if(event.httpMethod!=='GET')return{statusCode:405,headers:CORS,body:JSON.stringify({error:'Method Not Allowed'})};
 const s=await settings.read().catch(()=>({content:{bannerEnabled:false,bannerText:''}}));
 return{statusCode:200,headers:{...CORS,'Cache-Control':'public, max-age=60'},body:JSON.stringify({content:s.content||{bannerEnabled:false,bannerText:''}})};
};