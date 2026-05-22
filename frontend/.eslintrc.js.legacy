module.exports = {
  extends: "expo",
  plugins: ["import"],
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
        patterns: [
          {
            group: [
              "@/theme/modernDesign",
              "@/theme/modernDesign/*",
              "@/theme/unified",
              "@/theme/unified/*",
              "**/theme/modernDesign",
              "**/theme/modernDesign/*",
              "**/theme/unified",
              "**/theme/unified/*",
            ],
            message:
              "UI governance: use useUiTokens/themeTokens or the approved App* primitives. legacyCompat is the only migration bridge for old theme systems.",
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
