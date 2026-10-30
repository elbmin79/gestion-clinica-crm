// No offline caching: authenticated CRM responses must never be cached here.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json() || {};}catch{}
  const allowed=['Nueva cita registrada','Cita cancelada','Horario o asignación de cita actualizado','Prueba de notificaciones','Nueva solicitud de cita'];
  const body=allowed.includes(data.body)?data.body:'Hay una actualización en tu clínica.';
  event.waitUntil(self.registration.showNotification('CRM clínico',{body,tag:data.tag || 'crm-update',icon:'/push-icon-192.png',data:{url:data.url || '/agenda'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url || '/agenda',self.location.origin);
  if(target.origin!==self.location.origin || !['/agenda','/configuracion'].includes(target.pathname))return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(item=>new URL(item.url).origin===self.location.origin);
    if(client){await client.navigate(target.href);return client.focus();}
    return self.clients.openWindow(target.href);
  })());
});
