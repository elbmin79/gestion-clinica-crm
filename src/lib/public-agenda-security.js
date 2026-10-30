import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const slugPattern=/^[a-z0-9][a-z0-9-]{2,59}$/;
export async function readBookingBody(request,limit=8192){
  const invalid=(message,status)=>Object.assign(new Error(message),{status});
  if(Number(request.headers.get('content-length')||0)>limit)throw invalid('Solicitud demasiado grande.',413);
  const reader=request.body?.getReader();if(!reader)throw invalid('Solicitud inválida.',400);
  let size=0;const chunks=[];
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw invalid('Solicitud demasiado grande.',413);}chunks.push(value);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw invalid('Solicitud inválida.',400);}
  }finally{reader.releaseLock();}
}
export function agendaSecret(env=process.env){return env.PUBLIC_BOOKING_SECRET?.trim() || '';}
export function issueBookingChallenge(slug,secret,now=Date.now()){
  if(secret.length<32)throw new Error('Public booking secret is missing.');
  const payload=Buffer.from(JSON.stringify({slug,nonce:randomUUID(),issued:now})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function verifyBookingChallenge(token,slug,secret,now=Date.now()){
  try{
    if(secret.length<32 || typeof token!=='string' || token.length>600)return null;
    const [payload,signature,...extra]=token.split('.');if(extra.length)return null;
    const expected=createHmac('sha256',secret).update(payload).digest();const supplied=Buffer.from(signature,'base64url');
    if(expected.length!==supplied.length || !timingSafeEqual(expected,supplied))return null;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString());
    return data.slug===slug && uuidPattern.test(data.nonce) && Number.isSafeInteger(data.issued) && now-data.issued>=2000 && now-data.issued<=1800000?data:null;
  }catch{return null;}
}
export function normalizePublicRequest(body){
  const value={offerId:String(body.offerId || ''),startsAt:String(body.startsAt || ''),name:String(body.name || '').trim(),phone:String(body.phone || '').trim(),email:String(body.email || '').trim().toLowerCase(),consent:body.consent===true};
  if(!uuidPattern.test(value.offerId) || !/^\d{4}-\d{2}-\d{2}T/.test(value.startsAt) || !Number.isFinite(Date.parse(value.startsAt)))throw new Error('Selecciona un servicio y un horario disponible.');
  if(value.name.length<2 || value.name.length>160)throw new Error('Escribe tu nombre completo (hasta 160 caracteres).');
  if(!/^\+[1-9]\d{7,14}$/.test(value.phone))throw new Error('Usa un teléfono internacional sin espacios, por ejemplo +526641234567.');
  if(value.email && (value.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)))throw new Error('Revisa tu correo electrónico.');
  if(!value.consent)throw new Error('Autoriza que la clínica te contacte para atender tu solicitud.');
  value.startsAt=new Date(value.startsAt).toISOString();
  return {value,fingerprint:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
export function visitorRateKey(request,scope,secret,env=process.env){
  const header=env.VERCEL?'x-vercel-forwarded-for':env.PUBLIC_BOOKING_IP_HEADER;
  const address=header?(request.headers.get(header)||'unknown').split(',')[0].trim().slice(0,100):'unknown';
  return createHmac('sha256',secret).update(`${scope}:${address}`).digest('hex');
}
export function contactRateKey(slug,phone,secret){return createHmac('sha256',secret).update(`contact:${slug}:${phone}`).digest('hex');}
export async function verifyBookingCaptcha(token,request,nonce,{env=process.env,fetcher=fetch}={}){
  if(!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY)return env.NODE_ENV!=='production';
  if(typeof token!=='string' || !token || token.length>2048)return false;
  try{
    const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,idempotency_key:nonce}),signal:AbortSignal.timeout(10000)});
    if(!response.ok)return false;
    const result=await response.json();
    return result.success===true && result.action==='public_booking' && result.hostname===new URL(request.url).hostname;
  }catch{return false;}
}
