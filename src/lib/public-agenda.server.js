import 'server-only';
import {createServiceClient} from './supabase/service-client';
import {agendaSecret,issueBookingChallenge,verifyBookingChallenge,normalizePublicRequest,visitorRateKey,contactRateKey,verifyBookingCaptcha,readBookingBody,slugPattern,uuidPattern} from './public-agenda-security';

const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
function service(){const client=createServiceClient();if(!client)throw new Error('not configured');return client;}
async function rateCheck(client,key,limit,seconds){const {data,error}=await client.rpc('public_agenda_rate_check',{p_key:key,p_limit:limit,p_seconds:seconds});if(error)throw new Error('rate unavailable');return data===true;}

export async function publicAgendaRequest(request,slug){
  if(!slugPattern.test(slug))return reply({error:'La agenda no está disponible.'},404);
  const secret=agendaSecret();
  if(secret.length<32 || (process.env.NODE_ENV==='production'&&(!process.env.TURNSTILE_SITE_KEY||!process.env.TURNSTILE_SECRET_KEY)))return reply({error:'La agenda está temporalmente fuera de servicio. Intenta más tarde.'},503);
  try{
    const client=service();
    if(!await rateCheck(client,visitorRateKey(request,`read:${slug}`,secret),60,60))return reply({error:'Demasiadas consultas. Espera un minuto e inténtalo de nuevo.'},429);
    const {data:catalog,error:catalogError}=await client.rpc('public_agenda_catalog',{p_slug:slug});
    if(catalogError)throw new Error('catalog unavailable');
    if(!catalog)return reply({error:'Esta agenda no está publicada.'},404);
    if(request.method==='GET'){
      const url=new URL(request.url);const offer=url.searchParams.get('offer');
      if(offer){
        const date=url.searchParams.get('date');
        if(!uuidPattern.test(offer)||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return reply({error:'Selecciona un servicio y una fecha válidos.'},400);
        const {data,error}=await client.rpc('public_agenda_slots',{p_slug:slug,p_offer:offer,p_date:date});
        if(error)return reply({error:'No se pudieron consultar los horarios. Revisa la fecha.'},400);
        return reply({slots:data||[]});
      }
      return reply({...catalog,challenge:issueBookingChallenge(slug,secret),captchaSiteKey:process.env.TURNSTILE_SITE_KEY||''});
    }
    if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
    let body;try{body=await readBookingBody(request);}catch(error){return reply({error:error.message},error.status||400);}
    if(!body || typeof body!=='object'||Array.isArray(body))return reply({error:'Solicitud inválida.'},400);
    if(body.website)return reply({error:'No se pudo validar la solicitud.'},400);
    const challenge=verifyBookingChallenge(body.challenge,slug,secret);
    if(!challenge)return reply({error:'La sesión del formulario venció o no está lista. Recarga la página e inténtalo de nuevo.'},400);
    let normalized;try{normalized=normalizePublicRequest(body);}catch(error){return reply({error:error.message},400);}
    const {value,fingerprint}=normalized;
    // A valid signed retry may return its own receipt, never someone else's data.
    const previous=await client.from('public_booking_requests').select('id,fingerprint').eq('nonce',challenge.nonce).maybeSingle();
    if(previous.error)throw new Error('request lookup unavailable');
    if(previous.data)return previous.data.fingerprint===fingerprint?reply({id:previous.data.id,status:'pending_review'}):reply({error:'Este formulario ya fue enviado con otros datos. Recarga la página.'},409);
    if(!await rateCheck(client,visitorRateKey(request,`submit:${slug}`,secret),10,3600) || !await rateCheck(client,contactRateKey(slug,value.phone,secret),3,3600))return reply({error:'Ya recibimos varias solicitudes. Intenta más tarde o contacta a la clínica.'},429);
    if(!await verifyBookingCaptcha(body.captchaToken,request,challenge.nonce))return reply({error:'Completa nuevamente la verificación del formulario.'},400);
    const {data,error}=await client.rpc('submit_public_booking',{p_slug:slug,p_offer:value.offerId,p_start:value.startsAt,p_nonce:challenge.nonce,p_fingerprint:fingerprint,p_name:value.name,p_phone:value.phone,p_email:value.email,p_consent:value.consent});
    if(error)return reply({error:error.code==='23P01'?'Ese horario ya no está disponible. Elige otro.':error.code==='P0002'?'Esta agenda ya no está publicada.':'No se pudo registrar la solicitud. Revisa los campos y vuelve a intentarlo.'},error.code==='23P01'?409:400);
    return reply({id:data,status:'pending_review'},201);
  }catch{return reply({error:'La agenda está temporalmente fuera de servicio. Intenta más tarde.'},503);}
}
