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
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/services/httpClient", "@/services/httpClient"],
            message:
              "Import the transport layer through `@/api/client` instead of `services/httpClient`.",
          },
          {
            group: ["**/hooks/usePermissions", "@/hooks/usePermissions"],
            message:
              "Use `usePermission` from `@/hooks/usePermission` (single permission policy source).",
          },
        ],
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
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
        "no-restricted-imports": "off",
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
    {
      files: ["src/api/client.ts", "frontend/src/api/client.ts"],
      rules: {
        "no-restricted-imports": "off",
      },
    },
    {
      files: ["src/components/**/*.{ts,tsx}", "src/screens/**/*.{ts,tsx}", "frontend/src/components/**/*.{ts,tsx}", "frontend/src/screens/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "@/services/api",
                  "@/services/api/*",
                  "**/services/api",
                  "**/services/api/*",
                ],
                message:
                  "UI layers must consume domain service adapters instead of importing service API modules directly.",
              },
            ],
          },
        ],
      },
    },
  ],
};
