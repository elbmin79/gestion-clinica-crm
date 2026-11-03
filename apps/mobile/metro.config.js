const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = path.resolve(__dirname, '../..');
const webClientPath = path.join(projectRoot, 'src/lib/supabase/client.js');
const nativeClientPath = path.join(projectRoot, 'src/lib/supabase/client.native.ts');
const expoWebClientPath = path.join(projectRoot, 'src/lib/supabase/client.web.ts');
const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './client.js' || moduleName.endsWith('/src/lib/supabase/client.js')) {
    const requestedPath = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (requestedPath === webClientPath) {
      const replacementPath = platform === 'web' ? expoWebClientPath : nativeClientPath;
      const replacement = context.fileSystemLookup(replacementPath);
      if (replacement.exists && replacement.type === 'f') return { type: 'sourceFile', filePath: replacement.realPath };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
