// ESLint 9 flat config
// Migrated from .eslintrc.js — see git history for the legacy config.
const expoFlat = require("eslint-config-expo/flat");
const globals = require("globals");
module.exports = [
  // Expo/React Native base (includes TypeScript, React, and Expo rules)
  ...expoFlat,

  // import resolver settings and non-TS rules — all JS/TS files
  {
    settings: {
      "import/core-modules": ["expo-background-task"],
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"],
          alwaysTryTypes: true,
        },
        node: {
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
    },
    rules: {
      "import/no-unresolved": "error",
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
  },

  // TypeScript-specific overrides — @typescript-eslint plugin is only registered for TS files
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Test files — add Jest globals
  {
    files: [
      "**/*.test.js",
      "**/*.test.tsx",
      "**/*.spec.js",
      "**/*.spec.tsx",
      "jest.setup.js",
      "jest.polyfills.js",
      "**/__tests__/**",
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },

  // Node scripts and config files — CJS, no @typescript-eslint rules needed
  {
    files: [
      "scripts/**",
      "jest.setup.js",
      "jest.polyfills.js",
      "eslint.config.js",
      "babel.config.js",
      "metro.config.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Ignore generated / third-party directories and temp files
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "android/**",
      "ios/**",
      ".eslint-legacy-temp.cjs",
    ],
  },
];
