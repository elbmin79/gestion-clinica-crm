import test from 'node:test';
import assert from 'node:assert/strict';
import {issueBookingChallenge,verifyBookingChallenge,normalizePublicRequest,visitorRateKey,contactRateKey,verifyBookingCaptcha,readBookingBody} from './public-agenda-security.js';
const secret='test-secret-at-least-thirty-two-characters';
const now=2000000000000;
test('public request body limits apply to streamed bytes without trusting content-length',async()=>{
 assert.deepEqual(await readBookingBody(new Request('http://localhost',{method:'POST',body:'{"ok":true}'})),{ok:true});
 await assert.rejects(readBookingBody(new Request('http://localhost',{method:'POST',body:'invalid'})),error=>error.status===400);
 let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
 await assert.rejects(readBookingBody(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'})),error=>error.status===413);
 assert.equal(cancelled,true);
});
test('booking challenges are signed, slug-bound, delayed, expiring and tamper-resistant',()=>{
 const token=issueBookingChallenge('clinic',secret,now);
 assert.equal(verifyBookingChallenge(token,'clinic',secret,now+1000),null);
 assert.ok(verifyBookingChallenge(token,'clinic',secret,now+2500));
 assert.equal(verifyBookingChallenge(token,'other',secret,now+2500),null);
 assert.equal(verifyBookingChallenge(token,'clinic','other-secret',now+2500),null);
 assert.equal(verifyBookingChallenge(token+'x','clinic',secret,now+2500),null);
 assert.equal(verifyBookingChallenge(token,'clinic',secret,now+1800001),null);
});
test('request normalization validates contact fields and makes retries deterministic',()=>{
 const input={offerId:'10000000-0000-0000-0000-000000000001',startsAt:'2030-10-30T10:00:00-07:00',name:' Synthetic Visitor ',phone:'+526640000001',email:'TEST@example.test',consent:true};
 const first=normalizePublicRequest(input),second=normalizePublicRequest({...input,name:'Synthetic Visitor',email:'test@example.test',startsAt:'2030-10-30T17:00:00Z'});
 assert.equal(first.fingerprint,second.fingerprint);
 for(const changed of [{consent:false},{phone:'123'},{email:'not-an-email'},{name:'A'},{offerId:'other'},{startsAt:'invalid'}])assert.throws(()=>normalizePublicRequest({...input,...changed}));
});
test('rate keys hide addresses and contacts and only trust operator-configured proxy headers',()=>{
 const request=new Request('https://crm.test',{headers:{'x-forwarded-for':'spoofed','x-real-ip':'127.0.0.1'}});
 const a=visitorRateKey(request,'read:clinic',secret,{}),b=visitorRateKey(request,'read:clinic',secret,{PUBLIC_BOOKING_IP_HEADER:'x-real-ip'});
 assert.equal(a.length,64);assert.notEqual(a,b);assert.equal(contactRateKey('clinic','+526640000001',secret).length,64);
});
test('production captcha fails closed and validates provider success, action, and hostname',async()=>{
 const request=new Request('https://crm.test/api/public-agenda/clinic');
 assert.equal(await verifyBookingCaptcha('token',request,'nonce',{env:{NODE_ENV:'production'}}),false);
 assert.equal(await verifyBookingCaptcha('',request,'nonce',{env:{NODE_ENV:'development'}}),true);
 const env={NODE_ENV:'production',TURNSTILE_SITE_KEY:'public',TURNSTILE_SECRET_KEY:'private'};
 for(const result of [{success:false},{success:true,hostname:'evil.test',action:'public_booking'},{success:true,hostname:'crm.test',action:'other'}])assert.equal(await verifyBookingCaptcha('token',request,'nonce',{env,fetcher:async()=>Response.json(result)}),false);
 assert.equal(await verifyBookingCaptcha('token',request,'nonce',{env,fetcher:async()=>Response.json({success:true,hostname:'crm.test',action:'public_booking'})}),true);
});
