module.exports = function (api) {
  api.cache(true);
  const expoPreset = (() => {
    try {
      return require.resolve("babel-preset-expo");
    } catch {
      return require.resolve("babel-preset-expo", { paths: [require.resolve("jest-expo/package.json")] });
    }
  })();
  return {
    presets: [expoPreset],
    env: {
      production: {
        plugins: ["transform-remove-console"],
      },
    },
    plugins: [
      // Transform import.meta for web compatibility - MUST be first
      // This transforms import.meta.env to process.env for Safari compatibility
      [
        "babel-plugin-transform-import-meta",
        {
          // Replaces import.meta with a module-level object
        },
      ],
      // Re-enabled module-resolver to support '@/...' aliases
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./src",
          },
        },
      ],
      // Reanimated plugin includes worklets support and must be listed last
      "react-native-reanimated/plugin",
    ],
  };
};
