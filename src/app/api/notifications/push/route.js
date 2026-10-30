import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import { pushStatus,runStaffPush,extraPushServiceHosts } from '@/lib/push.server';
import { validPushSubscription } from '@/lib/push-validation';

export const runtime='nodejs';
export const maxDuration=60;
const respond=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

async function context(request,write=false) {
  if (write && request.headers.get('origin')!==new URL(request.url).origin) return {error:respond({error:'Origen no permitido.'},403)};
  const client=await createClient();
  const {data:{user}={}}=client?await client.auth.getUser():{};
  if (!user) return {error:respond({error:'Inicia sesión para configurar este dispositivo.'},401)};
  const clinicId=new URL(request.url).searchParams.get('clinicId');
  if (!/^[\da-f-]{36}$/i.test(clinicId || '')) return {error:respond({error:'Clínica inválida.'},400)};
  const {data,error}=await client.from('clinic_memberships').select('role').eq('clinic_id',clinicId).eq('user_id',user.id).maybeSingle();
  if (error || !data) return {error:respond({error:'No tienes acceso a esta clínica.'},403)};
  return {client,user,clinicId};
}
export async function GET(request) {
  const ctx=await context(request); if(ctx.error)return ctx.error;
  return respond(pushStatus());
}
export async function POST(request) {
  const ctx=await context(request,true); if(ctx.error)return ctx.error;
  if(!pushStatus().configured)return respond({error:'Configura las claves VAPID y el servicio de entrega en el servidor.'},503);
  let body; try{body=await request.json();}catch{return respond({error:'Solicitud inválida.'},400);}
  const subscription=body.subscription;
  if(!validPushSubscription(subscription,extraPushServiceHosts()))return respond({error:'Suscripción de navegador inválida.'},400);
  const service=createServiceClient();
  const {data:existing,error:lookupError}=await service.from('staff_push_subscriptions').select('id,user_id,clinic_id').eq('endpoint',subscription.endpoint).maybeSingle();
  if(lookupError)return respond({error:'No se pudo consultar el dispositivo.'},503);
  if(existing && existing.user_id!==ctx.user.id)return respond({error:'Desactiva las notificaciones de la otra cuenta en este navegador antes de vincularlo.'},409);
  if(body.action==='test') {
    if(!existing || existing.clinic_id!==ctx.clinicId)return respond({error:'Activa este dispositivo primero.'},400);
    const result=await service.rpc('queue_staff_push_test',{target_clinic:ctx.clinicId,target_user:ctx.user.id,target_subscription:existing.id});
    if(result.error)return respond({error:'Espera un minuto antes de repetir la prueba.'},429);
    try {const counts=await runStaffPush(5);return respond({ok:true,counts});}
    catch{return respond({error:'La prueba está en cola; revisa el servicio de entrega.'},503);}
  }
  const values={clinic_id:ctx.clinicId,user_id:ctx.user.id,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth};
  const result=existing?await service.from('staff_push_subscriptions').update(values).eq('id',existing.id).eq('user_id',ctx.user.id):await service.from('staff_push_subscriptions').insert(values);
  if(result.error)return respond({error:'No se pudo registrar el dispositivo. Vuelve a intentarlo.'},503);
  return respond({ok:true});
}
export async function DELETE(request) {
  const ctx=await context(request,true); if(ctx.error)return ctx.error;
  let body;try{body=await request.json();}catch{return respond({error:'Solicitud inválida.'},400);}
  if(typeof body.endpoint!=='string')return respond({error:'Dispositivo inválido.'},400);
  const result=await ctx.client.from('staff_push_subscriptions').delete().eq('endpoint',body.endpoint).eq('user_id',ctx.user.id).eq('clinic_id',ctx.clinicId);
  return result.error?respond({error:'No se pudo desvincular el dispositivo.'},503):respond({ok:true});
}
