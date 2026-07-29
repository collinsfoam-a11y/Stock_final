module.exports = {
  extends: "expo",
  plugins: ["import"],
  env: {
    jest: true,
    node: true,
  },
  settings: {
    "import/core-modules": ["expo-background-task"],
    "import/resolver": {
      typescript: {
        project: [
          "./tsconfig.json",
          "frontend/tsconfig.json",
          __dirname + "/tsconfig.json"
        ],
        alwaysTryTypes: true,
      },
      node: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
      },
    },
  },
  rules: {
    // Ensure imports are resolved correctly
    "import/no-unresolved": "error",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "react-native",
            importNames: ["TouchableOpacity"],
            message: "Use AppTouchable from @/components/ui/AppTouchable instead for accessibility compliance.",
          },
        ],
        patterns: [
          {
            group: [
              "@/theme/modernDesign",
              "@/theme/modernDesign/*",
              "@/theme/legacyCompat",
              "@/theme/legacyCompat/*",
              "@/theme/themeLegacy",
              "@/theme/themeLegacy/*",
              "**/theme/modernDesign",
              "**/theme/modernDesign/*",
              "**/theme/legacyCompat",
              "**/theme/legacyCompat/*",
              "**/theme/themeLegacy",
              "**/theme/themeLegacy/*",
            ],
            message:
              "UI governance: legacy theme files are deprecated. Use @/theme/unified tokens or useUiTokens().",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["*.test.js", "*.test.tsx", "*.spec.js", "*.spec.tsx", "jest.setup.js", "jest.polyfills.js", "**/__tests__/**"],
      env: {
        jest: true,
      },
      rules: {
        "@typescript-eslint/no-require-imports": "off",
      },
    },
    {
      files: ["scripts/**", "jest.setup.js", "jest.polyfills.js", ".eslintrc.js", "babel.config.js", "metro.config.js"],
      env: {
        node: true,
      },
      rules: {
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
};
