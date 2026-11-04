import publishedReleases from './mobile-releases.json' with { type: 'json' };

export function getMobileReleases(env = process.env, published = publishedReleases) {
  return {
    android: release(env.CRM_ANDROID_APK_URL, env.CRM_ANDROID_BUILD)
      ?? release(published.android?.url, published.android?.build),
    ios: release(env.CRM_IOS_INSTALL_URL, env.CRM_IOS_BUILD)
      ?? release(published.ios?.url, published.ios?.build),
  };
}

function release(value, buildValue) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const build = Number(buildValue);
    return { url: url.href, build: Number.isSafeInteger(build) && build > 0 ? build : null };
  } catch {
    return null;
  }
}
