/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.polyfills.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/e2e/",
    "/playwright-report/",
    "/test-results/",
  ],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/flash-list))",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/**/types/**",
    "!src/theme/**",
  ],
  coverageReporters: ["text", "text-summary", "html", "lcov"],
  coverageDirectory: "coverage",
  // Coverage floor pinned just below the measured baseline (as of this
  // commit: statements 20.75%, branches 14.49%, functions 16.86%,
  // lines 21.26%). This prevents silent regression while leaving a small
  // buffer for variance. Ratchet these upward as coverage improves.
  coverageThreshold: {
    global: {
      branches: 13,
      functions: 15,
      lines: 19,
      statements: 19,
    },
  },
};
