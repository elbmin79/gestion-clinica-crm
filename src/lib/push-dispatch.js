import { timingSafeEqual } from 'node:crypto';
import { validPushSubscription } from './push-validation.js';

export function authorizedPushDispatch(request, secret) {
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  return Boolean(secret) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function dispatchStaffPush(client, send, limit = 20,extraHosts=[]) {
  const {data: rows,error} = await client.rpc('claim_staff_push',{target_limit:limit});
  if (error) throw new Error('No se pudo consultar la cola de notificaciones.');
  const counts = {sent:0,failed:0,pending:0,skipped:0};
  for (const row of rows || []) {
    const subscription = {endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}};
    const {data:eligible,error:checkError} = await client.rpc('staff_push_is_eligible',{target_id:row.delivery_id,target_token:row.token});
    let state = 'skipped', reason = null;
    if (checkError) { state='pending'; reason='Eligibility unavailable'; }
    else if (eligible && validPushSubscription(subscription,extraHosts)) {
      try {
        await send(subscription, JSON.stringify({title:'CRM clínico',body:row.message,tag:`staff-${row.delivery_id}`,url:row.message==='Nueva solicitud de cita'?`/configuracion?tab=public-agenda&clinic=${encodeURIComponent(row.clinic_id)}`:`/agenda?clinic=${encodeURIComponent(row.clinic_id)}${row.appointment_id ? `&appointment=${encodeURIComponent(row.appointment_id)}` : ''}`}));
        state='sent';
      } catch (error) {
        const status=Number(error.statusCode || 0);
        if (status===404 || status===410) {
          const result=await client.from('staff_push_subscriptions').delete().eq('id',row.subscription_id);
          if (result.error) throw new Error('No se pudo retirar una suscripción vencida.');
          counts.skipped++; continue;
        }
        state=(!status || status===429 || status>=500)?'pending':'failed';
        reason=`Push provider status ${status || 'unavailable'}`;
      }
    }
    const result=await client.rpc('settle_staff_push',{target_id:row.delivery_id,target_token:row.token,target_state:state,target_error:reason});
    if (result.error || result.data!==true) throw new Error('No se pudo guardar el resultado de entrega.');
    counts[state]++;
  }
  return counts;
}
