import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleOAuthAuthorizationUrl, verifyGoogleCalendarState } from './google-calendar-oauth-state.js';

const config = {
  clinicId: 'clinic-1',
  userId: 'user-1',
  nonce: 'nonce-123',
  clientSecret: 'test-client-secret',
  clientId: 'test-client-id.apps.googleusercontent.com',
  redirectUri: 'https://crm.example.test/api/integrations/google-calendar/callback',
};

test('Google Calendar native OAuth state is signed, short-lived, and marked for the app callback', () => {
  const { url } = createGoogleOAuthAuthorizationUrl({ ...config, mobile: true });
  const state = verifyGoogleCalendarState(url.searchParams.get('state'), config.clientSecret);

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(state.clinicId, config.clinicId);
  assert.equal(state.userId, config.userId);
  assert.equal(state.nonce, config.nonce);
  assert.equal(state.mobile, true);
  assert.ok(state.exp > Date.now() && state.exp <= Date.now() + 10 * 60 * 1000);
});

test('Google Calendar web OAuth keeps its cookie-bound state mode and rejects tampering', () => {
  const { state: signedState } = createGoogleOAuthAuthorizationUrl(config);
  const state = verifyGoogleCalendarState(signedState, config.clientSecret);

  assert.equal(state.mobile, undefined);
  assert.equal(verifyGoogleCalendarState(`${signedState}x`, config.clientSecret), null);
});
