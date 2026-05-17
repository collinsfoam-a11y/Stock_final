#!/usr/bin/env node

const assert = require("node:assert/strict");

const { advisoryChecks, evaluateConvergence, hardChecks, parseArgs } = require("./check-runtime-convergence.cjs");

const baseline = {
  updatedAt: "2026-05-08T00:00:00.000Z",
  hardLimits: {
    offlineSyncImports: 0,
    uiToastImports: 0,
    syncOrchestratorOwners: 1,
    offlineSyncWrapperNonShim: 0,
  },
  advisoryCeilings: {
    legacyCompatImports: 120,
    modernDesignSystemImports: 60,
    setIntervalCount: 20,
    addEventListenerCount: 20,
    appStateAddListenerCount: 8,
    intervalOwnerFileCount: 16,
    wrapperFileCount: 10,
  },
};

function metrics(overrides = {}) {
  const importOverrides = overrides.counts?.imports || {};
  const runtimeOverrides = overrides.counts?.runtime || {};
  const wrapperOverrides = overrides.counts?.wrappers || {};
  const topLevelOverrides = { ...overrides };
  delete topLevelOverrides.counts;
  delete topLevelOverrides.flags;
  return {
    counts: {
      imports: {
        offlineSyncService: 0,
        uiToast: 0,
        legacyCompat: 120,
        modernDesignSystem: 60,
        ...importOverrides,
      },
      runtime: {
        setInterval: 20,
        addEventListener: 20,
        appStateAddListener: 8,
        intervalOwnerFiles: 16,
        syncOrchestratorOwners: 1,
        ...runtimeOverrides,
      },
      wrappers: {
        existing: 10,
        ...wrapperOverrides,
      },
    },
    flags: {
      offlineSyncWrapperIsThinShim: true,
      ...(overrides.flags || {}),
    },
    ...topLevelOverrides,
  };
}

function testParseArgs() {
  const parsed = parseArgs(["--json", "--strict-advisory"]);
  assert.equal(parsed.json, true);
  assert.equal(parsed.strictAdvisory, true);
}

function testHardChecksPass() {
  const checks = hardChecks(metrics(), baseline);
  assert.equal(checks.every((check) => check.status === "pass"), true);
}

function testHardChecksFailWhenDuplicateSyncImportAppears() {
  const checks = hardChecks(metrics({ counts: { imports: { offlineSyncService: 1 } } }), baseline);
  assert.equal(checks.find((check) => check.id === "offline-sync-imports")?.status, "fail");
}

function testAdvisoryWarnByDefault() {
  const checks = advisoryChecks(
    metrics({ counts: { imports: { legacyCompat: 125 } } }),
    baseline,
    false,
  );
  assert.equal(checks.find((check) => check.id === "legacy-compat-imports")?.status, "warn");
}

function testStrictAdvisoryFails() {
  const result = evaluateConvergence(
    metrics({ counts: { runtime: { setInterval: 25 } } }),
    baseline,
    { strictAdvisory: true },
  );
  assert.equal(result.status, "fail");
}

testParseArgs();
testHardChecksPass();
testHardChecksFailWhenDuplicateSyncImportAppears();
testAdvisoryWarnByDefault();
testStrictAdvisoryFails();

console.log("check-runtime-convergence tests passed");
