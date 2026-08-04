const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

// Zustand's ESM middleware references import.meta, but Expo web exports use a
// classic script tag. Resolve Zustand's CJS build on web so the bundle parses.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && (moduleName === "zustand" || moduleName.startsWith("zustand/"))) {
    return context.resolveRequest(
      {
        ...context,
        isESMImport: false,
        unstable_conditionNames: ["require"]
      },
      moduleName,
      platform
    );
  }

  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
