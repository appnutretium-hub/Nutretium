'use strict';
const { FactusolCommerce } = require('./factusol-commerce');
function cents(v){return Math.round(Number(v)*100)}
async function validate(lines){
  const service=await FactusolCommerce.create();
  const readiness=service.readiness();
  if(!readiness.liveEnabled)return{ok:true,bypassed:true,reason:'disabled'};
  if(!readiness.liveCatalogReady)return{ok:false,statusCode:503,error:'La sincronización con FACTUSOL está activada pero incompleta. No se iniciará ningún cobro.',motivo:'factusol-not-ready'};
  let check;
  try{check=await service.validateCart(lines)}catch(error){console.error('[factusol-checkout-gate]',error);return{ok:false,statusCode:503,error:'No se ha podido confirmar stock y precio en FACTUSOL. No se iniciará ningún cobro.',motivo:'factusol-validation-failed'}}
  if(!check.ok){const stock=check.problems.find(x=>x.reason==='insufficient-stock');return{ok:false,statusCode:409,error:stock?`Stock actualizado: solo quedan ${stock.available} unidades de ${stock.code}.`:'El catálogo de FACTUSOL no coincide con el pedido. Actualiza la página antes de continuar.',motivo:'factusol-catalog-conflict',detalles:check.problems}}
  const byCode=new Map(check.items.map(x=>[String(x.code),x])),problems=[];
  for(const line of lines||[]){const erp=byCode.get(String(line.code));if(!erp||erp.price===null||cents(erp.price)!==cents(line.price))problems.push({code:line.code,web:line.price,erp:erp?.price??null})}
  if(problems.length)return{ok:false,statusCode:409,error:'El precio de uno o más productos ha cambiado en FACTUSOL. Actualiza la página antes de pagar.',motivo:'factusol-price-conflict',detalles:problems};
  return{ok:true,bypassed:false,items:check.items};
}
module.exports={validate,cents};
