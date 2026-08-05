// Learn more https://docs.expo.io/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Fix for Safari: transform import.meta in node_modules for web
// Zustand's devtools uses import.meta.env which Safari doesn't support in non-module scripts
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

// Ensure node_modules with import.meta are transpiled for web
config.resolver = {
  ...config.resolver,
};

const defaultResolveRequest =
  config.resolver.resolveRequest ||
  ((context, moduleName, platform) => context.resolveRequest(context, moduleName, platform));
const zustandMiddlewareFile = path.join(
  __dirname,
  "node_modules",
  "zustand",
  "middleware.js",
);
const sentryReplayWebStub = path.join(
  __dirname,
  "scripts",
  "stubs",
  "sentry-replay-web-stub.js",
);
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Drop Session Replay from the web bundle. It is reachable only by static
  // re-export from the @sentry/react-native entry and is never instantiated
  // (Sentry.init sets no replay sample rate), but Metro does not tree-shake, so
  // it costs ~300 kB in the common chunk. See the stub for the full rationale
  // and for what to do if Replay is ever enabled.
  if (platform === "web" && moduleName.startsWith("@sentry-internal/replay")) {
    return {
      type: "sourceFile",
      filePath: sentryReplayWebStub,
    };
  }

  // Force Zustand middleware to CJS build: ESM variant contains import.meta.env
  // which breaks when the bundle runs as a non-module script.
  if (
    moduleName === "zustand/middleware" ||
    moduleName === "zustand/esm/middleware.mjs" ||
    moduleName === "zustand/esm/middleware"
  ) {
    return {
      type: "sourceFile",
      filePath: zustandMiddlewareFile,
    };
  }
  return defaultResolveRequest(context, moduleName, platform);
};

// Add WASM support for expo-sqlite
config.resolver.assetExts.push("wasm");

module.exports = config;
