import { createClient } from './supabase/client.js';
export const defaultNotificationPreferences={new_appointment:true,agenda_change:true,include_self:false,push_enabled:true};
export async function loadNotificationPreferences(clinicId) {
  const client=createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)throw new Error('Inicia sesión para configurar los avisos.');
  const {data,error}=await client.from('staff_notification_preferences').select('new_appointment,agenda_change,include_self,push_enabled').eq('clinic_id',clinicId).eq('user_id',user.id).maybeSingle();
  if(error)throw new Error('No se pudieron cargar las preferencias. Revisa la conexión y la migración de notificaciones.');
  return {...defaultNotificationPreferences,...data};
}
export async function saveNotificationPreferences(clinicId,preferences) {
  const client=createClient();
  const {data:{user}}=await client.auth.getUser();
  if(!user)throw new Error('Inicia sesión para guardar los avisos.');
  const {error}=await client.from('staff_notification_preferences').upsert({clinic_id:clinicId,user_id:user.id,...Object.fromEntries(Object.keys(defaultNotificationPreferences).map(key=>[key,preferences[key]===true]))});
  if(error)throw new Error('No se pudieron guardar las preferencias. Vuelve a intentarlo.');
}
export const demoNotificationKey='crm-demo-staff-alerts-v1';
export const demoPreferenceKey='crm-demo-staff-preferences-v1';
export async function unlinkPushOnSignOut(formData) {
  try {
    const registration=await navigator.serviceWorker?.getRegistration('/');
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription){formData.set('pushEndpoint',subscription.endpoint);await subscription.unsubscribe();}
  }catch { /* Server cleanup still runs when a browser API is unavailable. */ }
}
export function addDemoAppointmentAlert(kind,message,appointmentId){
  try {
    const prefs={...defaultNotificationPreferences,...JSON.parse(localStorage.getItem(demoPreferenceKey)||'{}')};
    if(!prefs[kind] || !prefs.include_self)return;
    const items=JSON.parse(localStorage.getItem(demoNotificationKey)||'[]');
    localStorage.setItem(demoNotificationKey,JSON.stringify([{id:crypto.randomUUID(),message,createdAt:Date.now(),read:false,appointmentAlert:true,href:appointmentId?`/agenda?appointment=${encodeURIComponent(appointmentId)}`:'/agenda'},...items].slice(0,100)));
    window.dispatchEvent(new Event('crm-staff-alerts'));
  }catch{ /* Demo storage may be disabled; never fall back to shared data. */ }
}
