export function validExpoPushToken(value) {
  return typeof value === 'string' && /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,}\]$/.test(value);
}

export function nativeNotificationRoute(row) {
  if (row.kind === 'bill_due') return '/payments';
  if (row.kind === 'whatsapp_message' || row.kind === 'whatsapp_confirmation') return '/whatsapp';
  if (row.booking_request_id || row.message === 'Nueva solicitud de cita') return '/public-agenda';
  if (row.appointment_id) return `/appointment/${encodeURIComponent(row.appointment_id)}`;
  return '/(tabs)/agenda';
}

export async function dispatchNativeStaffPush(client, send, limit = 20) {
  const { data: rows, error } = await client.rpc('claim_staff_native_push', { target_limit: limit });
  if (error) throw new Error('No se pudo consultar la cola de notificaciones nativas.');
  const counts = { sent: 0, failed: 0, pending: 0, skipped: 0 };
  for (const row of rows || []) {
    const { data: eligible, error: checkError } = await client.rpc('staff_native_push_is_eligible', { target_id: row.delivery_id, target_token: row.token });
    let state = 'skipped', reason = null;
    if (checkError) { state = 'pending'; reason = 'Eligibility unavailable'; }
    else if (eligible && validExpoPushToken(row.expo_push_token)) {
      try {
        await send(row.expo_push_token, {
          title: 'CRM clínico',
          body: row.message,
          data: { route: nativeNotificationRoute(row) },
          sound: 'default',
          priority: 'high',
        });
        state = 'sent';
      } catch (error) {
        const status = Number(error.statusCode || 0);
        if (status === 404 || status === 410) {
          const result = await client.from('staff_native_push_subscriptions').delete().eq('id', row.subscription_id);
          if (result.error) throw new Error('No se pudo retirar un dispositivo nativo vencido.');
          counts.skipped++;
          continue;
        }
        state = (!status || status === 429 || status >= 500) ? 'pending' : 'failed';
        reason = `Expo push provider status ${status || 'unavailable'}`;
      }
    }
    const result = await client.rpc('settle_staff_native_push', { target_id: row.delivery_id, target_token: row.token, target_state: state, target_error: reason });
    if (result.error || result.data !== true) throw new Error('No se pudo guardar el resultado de entrega nativa.');
    counts[state]++;
  }
  return counts;
}
