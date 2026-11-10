import test from 'node:test';
import assert from 'node:assert/strict';
import { demoClinicServices } from './clinic-services.js';
import { calculateServiceDeposit, parseFixedDeposit } from './service-deposits.js';

const date='2026-11-09';
const service=(amount,currency='MXN')=>({id:'ordinary',name:'Facial',offers:[{kind:'single',amount,currency}]});
const suggest=(...services)=>calculateServiceDeposit(services,[],date).amount;

test('clinic price tiers include boundaries and leave unpriced, low-price and USD tiers manual',()=>{
  for (const [price,deposit] of [[499.99,null],[500,200],[1000,200],[1000.01,500],[3000,500],[3000.01,1000]]) {
    assert.equal(suggest(service(price)),deposit);
  }
  assert.equal(suggest(service(1500,'USD')),null);
  assert.equal(suggest(service(null)),null);
  assert.equal(parseFixedDeposit('350.50'),350.5);
  assert.throws(()=>parseFixedDeposit('0'));
});

test('fixed rules override price tiers and configurable modes can replace clinic defaults',()=>{
  const catalog=code=>demoClinicServices.find(item=>item.code===code);
  assert.equal(suggest(catalog('consulta-valoracion')),500);
  assert.equal(suggest(catalog('lipo-assessment')),500);
  assert.equal(suggest(catalog('lipo-1')),2000);
  assert.equal(suggest(catalog('fac-morpheus8')),1000);
  assert.equal(suggest({...catalog('fac-morpheus8'),depositMode:'fixed',depositFixedAmount:750}),750);
  assert.equal(suggest({...catalog('fac-morpheus8'),depositMode:'manual'}),null);
  assert.equal(suggest(service(750),service(1100),catalog('lipo-1')),2700);
  assert.equal(suggest(service(750),service(200)),null);
});

test('the full and tier modes use the session price effective on the appointment date',()=>{
  const promotion={id:'p',serviceId:'ordinary',kind:'single',active:true,name:'Oferta',amount:800,currency:'MXN',startsOn:'2026-11-01',endsOn:'2026-11-30'};
  assert.equal(calculateServiceDeposit([service(1600)],[promotion],date).amount,200);
  assert.equal(calculateServiceDeposit([{...service(1600),depositMode:'full'}],[promotion],date).amount,800);
  assert.equal(calculateServiceDeposit([service(1600)],[promotion],'2026-12-01').amount,500);
});

test('a package-only service explains the blank total while retaining the calculable subtotal',()=>{
  const catalog=code=>demoClinicServices.find(item=>item.code===code);
  const alopecia=catalog('velka-alopecia');
  const drainage=catalog('corp-drenaje');
  assert.deepEqual(calculateServiceDeposit([alopecia,drainage],[],date), {
    amount:null,subtotal:500,pending:['Drenaje Linfático'],
  });
  assert.equal(suggest(alopecia,{...drainage,depositMode:'fixed',depositFixedAmount:200}),700);
});
