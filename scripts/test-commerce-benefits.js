'use strict';
process.env.NUTRETIUM_TEST_MEMORY_BLOBS='true';
const assert=require('assert');
const store=require('../netlify/lib/enterprise-store');
const effects=require('../netlify/lib/order-effects');

const original={list:store.list,get:store.get,save:store.save};
const db=new Map();
const key=(domain,id)=>`${domain}:${id}`;
const put=(domain,row)=>{const id=row.id||row.key;db.set(key(domain,id),JSON.parse(JSON.stringify({...row,id})));return db.get(key(domain,id));};
put('commerce-settings',{id:'checkout',key:'checkout',status:'active',loyaltyCentPerPoint:5,loyaltyEarnPointsPerEuro:2,referralBuyerDiscountCents:300,referralOwnerRewardPoints:25});
put('gift-cards',{id:'gc1',code:'REGALO15',status:'active',balanceCents:1500,ledger:[]});
put('loyalty',{id:'loy-buyer',customerEmail:'buyer@example.com',status:'active',balance:200,history:[]});
put('loyalty',{id:'loy-owner',customerEmail:'owner@example.com',status:'active',balance:10,history:[]});
put('referrals',{id:'ref1',code:'AMIGO300',status:'active',ownerEmail:'owner@example.com',conversions:0});
store.list=async(domain)=>[...db.entries()].filter(([k])=>k.startsWith(`${domain}:`)).map(([,v])=>JSON.parse(JSON.stringify(v)));
store.get=async(domain,id)=>{const v=db.get(key(domain,id));return v?JSON.parse(JSON.stringify(v)):null;};
store.save=async(domain,row,_actor,opts={})=>{const id=opts.id||row.id||row.key;if(!id)throw new Error(`id requerido para ${domain}`);return put(domain,{...row,id});};

(async()=>{
 try{
  const quoted=await effects.quoteBenefits({email:'buyer@example.com',subtotalAfterPromoCents:5000,giftCardCode:'REGALO15',usePoints:100,referralCode:'AMIGO300'});
  assert.strictEqual(quoted.giftCard.useCents,1500,'gift card debe aplicar saldo disponible');
  assert.strictEqual(quoted.loyalty.points,100,'debe canjear los puntos solicitados');
  assert.strictEqual(quoted.loyalty.valueCents,500,'100 puntos a 5 céntimos deben valer 500');
  assert.strictEqual(quoted.referral.discountCents,300,'referido debe aplicar descuento configurado');
  assert.strictEqual(quoted.extraDiscountCents,2300,'beneficios combinados deben sumar correctamente');
  assert.strictEqual(quoted.remainingCents,2700,'el saldo restante debe ser correcto');
  await assert.rejects(()=>effects.quoteBenefits({email:'owner@example.com',subtotalAfterPromoCents:5000,referralCode:'AMIGO300'}),/propio código/i,'no debe permitir autorreferido');
  quoted.paidCents=2700;
  await effects.commitBenefits('ORDER123','buyer@example.com',quoted);
  const card=await store.get('gift-cards','gc1');
  const buyer=await store.get('loyalty','loy-buyer');
  const owner=await store.get('loyalty','loy-owner');
  const referral=await store.get('referrals','ref1');
  assert.strictEqual(card.balanceCents,0,'gift card debe descontarse al liquidar');
  assert.strictEqual(card.status,'redeemed','gift card agotada debe quedar redeemed');
  assert.strictEqual(buyer.balance,154,'buyer: 200-100 + 54 puntos ganados por 27 € a 2 puntos/€');
  assert.strictEqual(owner.balance,35,'owner debe recibir 25 puntos por referido');
  assert.strictEqual(referral.conversions,1,'referido debe registrar una conversión');
  assert(await store.get('commerce-settings','settled:ORDER123'),'debe crear marcador idempotente de liquidación');
  await effects.commitBenefits('ORDER123','buyer@example.com',quoted);
  assert.strictEqual((await store.get('loyalty','loy-buyer')).balance,154,'reintento no debe duplicar puntos');
  assert.strictEqual((await store.get('loyalty','loy-owner')).balance,35,'reintento no debe duplicar recompensa de referido');
  assert.strictEqual((await store.get('referrals','ref1')).conversions,1,'reintento no debe duplicar conversión');
  console.log('✓ gift card aplicada y liquidada de forma idempotente');
  console.log('✓ fidelización canjea y acumula puntos según configuración');
  console.log('✓ referidos aplican descuento, bloquean autorreferido y recompensan una sola vez');
  console.log('\n3 pruebas de beneficios de comercio superadas.');
 } finally { store.list=original.list;store.get=original.get;store.save=original.save; }
})().catch(error=>{console.error(error);process.exit(1);});
