import assert from 'node:assert/strict';
import test from 'node:test';
import { getMobileReleases } from './mobile-release.js';

test('publishes each platform’s own installer and build number', () => {
  assert.deepEqual(getMobileReleases({
    CRM_ANDROID_APK_URL: 'https://downloads.example.org/elixir.apk',
    CRM_ANDROID_BUILD: '12',
    CRM_IOS_INSTALL_URL: 'https://testflight.apple.com/join/example',
    CRM_IOS_BUILD: '9',
  }), {
    android: { url: 'https://downloads.example.org/elixir.apk', build: 12 },
    ios: { url: 'https://testflight.apple.com/join/example', build: 9 },
  });
});

test('suppresses update prompts when no safe installer is configured', () => {
  for (const url of [undefined, 'http://example.org/app.apk', 'https://user:pass@example.org/app.apk', 'javascript:alert(1)']) {
    assert.deepEqual(getMobileReleases({ CRM_ANDROID_APK_URL: url, CRM_ANDROID_BUILD: '12' }), {
      android: null,
      ios: null,
    });
  }
});

test('allows first installs without advertising an invalid build number', () => {
  for (const build of [undefined, '0', '-1', '1.2', 'latest', '9007199254740992']) {
    const { android } = getMobileReleases({
      CRM_ANDROID_APK_URL: 'https://downloads.example.org/elixir.apk',
      CRM_ANDROID_BUILD: build,
    });
    assert.deepEqual(android, { url: 'https://downloads.example.org/elixir.apk', build: null });
  }
});
