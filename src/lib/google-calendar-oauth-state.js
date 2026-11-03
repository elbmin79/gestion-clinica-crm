import { createHmac, timingSafeEqual } from 'node:crypto';

export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export function signGoogleCalendarState(payload, clientSecret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', clientSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyGoogleCalendarState(value, clientSecret) {
  const [encoded, signature, extra] = String(value || '').split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', clientSecret).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
}

export function createGoogleOAuthAuthorizationUrl({ clinicId, userId, nonce, mobile = false, clientSecret, clientId, redirectUri }) {
  const state = signGoogleCalendarState({ clinicId, userId, nonce, ...(mobile ? { mobile: true } : {}), exp: Date.now() + 10 * 60 * 1000 }, clientSecret);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent select_account');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return { url, state };
}
