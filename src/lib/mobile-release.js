export function getMobileReleases(env = process.env) {
  return {
    android: release(env.CRM_ANDROID_APK_URL, env.CRM_ANDROID_BUILD),
    ios: release(env.CRM_IOS_INSTALL_URL, env.CRM_IOS_BUILD),
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
