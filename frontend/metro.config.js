// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("metro-resolver");

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

const defaultResolveRequest = config.resolver.resolveRequest || resolve;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force Zustand middleware to CJS build: ESM variant contains import.meta.env
  // which breaks when the bundle runs as a non-module script.
  if (
    moduleName === "zustand/middleware" ||
    moduleName === "zustand/esm/middleware.mjs" ||
    moduleName === "zustand/esm/middleware"
  ) {
    return defaultResolveRequest(context, "zustand/middleware.js", platform);
  }
  return defaultResolveRequest(context, moduleName, platform);
};

// Add WASM support for expo-sqlite
config.resolver.assetExts.push("wasm");

module.exports = config;
