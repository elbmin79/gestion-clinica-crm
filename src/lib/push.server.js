import 'server-only';
import webpush from 'web-push';
import { pushConfigured } from './push-validation.js';
import { dispatchStaffPush } from './push-dispatch.js';
import { createServiceClient } from './supabase/service-client';

export function pushStatus() {
  return {configured:pushConfigured(process.env) && Boolean(createServiceClient()),publicKey:process.env.VAPID_PUBLIC_KEY || ''};
}
export function extraPushServiceHosts(){return (process.env.PUSH_EXTRA_SERVICE_HOSTS || '').split(',').map(host=>host.trim()).filter(Boolean);}
export async function runStaffPush(limit=20) {
  if (!pushStatus().configured) throw new Error('La entrega push aún no está configurada en el servidor.');
  return dispatchStaffPush(createServiceClient(),(subscription,payload)=>webpush.sendNotification(subscription,payload,{
    vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY},
    TTL:3600,timeout:10000,
  }),limit,extraPushServiceHosts());
}
