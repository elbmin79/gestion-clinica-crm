// Only known browser push services may be contacted by the server (SSRF guard).
export function validPushSubscription(value,extraHosts=[]) {
  try {
    const url = new URL(value.endpoint);
    const host = url.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.notify.windows.com') || extraHosts.includes(host);
    return allowed && url.protocol === 'https:' && !url.username && !url.password && !url.port && value.endpoint.length <= 2048
      && /^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth || '');
  } catch { return false; }
}

export function pushConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && /^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT || ''));
}
