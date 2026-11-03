import 'server-only';
import { dispatchNativeStaffPush } from './native-push-dispatch.js';
import { createServiceClient } from './supabase/service-client';

const expoPushUrl = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush(token, payload) {
  const response = await fetch(expoPushUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: token, ...payload }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!response.ok || ticket?.status === 'error') {
    const error = new Error('Expo push delivery was rejected.');
    error.statusCode = ticket?.details?.error === 'DeviceNotRegistered' ? 410 : response.status || (ticket?.message ? 400 : 503);
    throw error;
  }
  if (ticket?.status !== 'ok') {
    const error = new Error('Expo did not confirm the push ticket.');
    error.statusCode = 503;
    throw error;
  }
  return ticket;
}

export async function runStaffNativePush(limit = 20) {
  const client = createServiceClient();
  if (!client) throw new Error('El servicio seguro del servidor no está configurado.');
  return dispatchNativeStaffPush(client, sendExpoPush, limit);
}
