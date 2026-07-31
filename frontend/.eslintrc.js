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
    // ── Authority-boundary guard (P0A) ──────────────────────────────────────────
    // The frontend must never reconstruct authoritative reconciliation,
    // finalization, or recount decisions that the backend already computes.
    // UI/service code must consume the pre-computed values via the view-model
    // adapters in src/viewModels/. See §14.1 of the UI/UX Redesign Proposal.
    //
    // 1) Ban the non-canonical reconciliation fields outright. These come from
    //    reconciliation_api.py and must never be read directly; the canonical
    //    model lives in sql_variance_engine.py and is surfaced via
    //    toVarianceViewModel().
    "no-restricted-properties": [
      "error",
      { property: "erp_drift", message: "Authority boundary: 'erp_drift' is a non-canonical reconciliation field. Surface variance via toVarianceViewModel() in @/viewModels — never read backend reconciliation values directly." },
      { property: "final_gap", message: "Authority boundary: 'final_gap' is a non-canonical reconciliation field. Surface variance via toVarianceViewModel() in @/viewModels — never read backend reconciliation values directly." },
      { property: "count_variance", message: "Authority boundary: 'count_variance' is a non-canonical reconciliation field. Surface variance via toVarianceViewModel() in @/viewModels — never read backend reconciliation values directly." },
    ],
    // 2) Ban arithmetic recomputation of canonical authoritative quantities
    //    outside the adapter layer. Display-only decomposition is permitted
    //    only inside src/viewModels/ (see overrides below).
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "BinaryExpression[operator=/[-*\\/%]/] MemberExpression[property.type='Identifier'][property.name=/^(audit_delta|operational_delta|shortage_qty|excess_qty|movement_adjusted_expected|quantity_delta|system_qty|verified_qty|counted_qty|baseline_qty|sql_qty_at_submission|erp_qty|allowed)$/]",
        message:
          "Authority boundary: do not recompute authoritative reconciliation/finalization quantities in the frontend. Read the backend-provided value via the view-model adapter (@/viewModels). Display-only decomposition is allowed only inside src/viewModels/.",
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
        // Tests may assert against raw field arithmetic; the guard targets
        // production UI/service code only.
        "no-restricted-syntax": "off",
      },
    },
    {
      // The adapter layer legitimately decomposes authoritative quantities for
      // display formatting (e.g. shortage/excess split). It never recomputes
      // the authoritative value itself.
      files: ["src/viewModels/**"],
      rules: {
        "no-restricted-syntax": "off",
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
