#!/usr/bin/env node

const assert = require("node:assert/strict");

const { evaluateHealth, hardChecks, parseArgs } = require("./check-ui-governance-health.cjs");

const baseline = {
  hardLimits: {
    blockingFindings: 0,
    P0: 0,
    P1: 0,
    deprecatedProduction: 0,
    navigationFindings: 0,
    virtualizationFindings: 0,
    auroraThemeFindings: 0,
    decorativeBackgroundFindings: 0,
  },
  advisoryCeilings: {
    totalFindings: 10,
    advisoryFindings: 8,
    quarantineFindings: 2,
    tokenAdoptionFindings: 5,
    accessibilityFindings: 2,
    motionFindings: 1,
  },
  coverageFloors: {
    tokenAdoptionEstimate: 0.6,
    accessibilityFileCoverage: 0.4,
    reducedMotionCoverage: 0.1,
    virtualizationCoverage: 0.2,
  },
};

function metrics(overrides = {}) {
  return {
    counts: {
      findings: 10,
      blockingFindings: 0,
      bySeverity: { P2: 10 },
      byStatus: { advisory: 8, quarantine: 2 },
      byCategory: { "token-adoption": 5, accessibility: 2, motion: 1 },
      byRule: { UI015: 5, UI016: 1, UI017: 2, UI010: 2 },
      ...overrides.counts,
    },
    tokenAdoption: { estimatedFileAdoption: 0.6, ...overrides.tokenAdoption },
    accessibility: { estimatedFileCoverage: 0.4, ...overrides.accessibility },
    reducedMotion: { coverage: 0.1, ...overrides.reducedMotion },
    virtualization: { coverage: 0.2, ...overrides.virtualization },
    deprecated: { total: 0, ...overrides.deprecated },
  };
}

function testParseArgs() {
  assert.deepEqual(parseArgs(["--json", "--strict-advisory"]).json, true);
  assert.equal(parseArgs(["--json", "--strict-advisory"]).strictAdvisory, true);
}

function testHardChecksPassAtZero() {
  const checks = hardChecks(metrics(), baseline);
  assert.equal(checks.every((check) => check.status === "pass"), true);
}

function testHardChecksFailOnP1Regression() {
  const checks = hardChecks(metrics({ counts: { bySeverity: { P1: 1 } } }), baseline);
  assert.equal(checks.find((check) => check.id === "p1-findings")?.status, "fail");
}

function testAdvisoryWarningsDoNotFailDefaultMode() {
  const result = evaluateHealth(
    { metrics: metrics({ counts: { findings: 11, byStatus: { advisory: 9 } } }) },
    baseline
  );
  assert.equal(result.status, "warn");
}

function testStrictAdvisoryFailsOnRegression() {
  const result = evaluateHealth(
    { metrics: metrics({ accessibility: { estimatedFileCoverage: 0.2 } }) },
    baseline,
    { strictAdvisory: true }
  );
  assert.equal(result.status, "fail");
}

testParseArgs();
testHardChecksPassAtZero();
testHardChecksFailOnP1Regression();
testAdvisoryWarningsDoNotFailDefaultMode();
testStrictAdvisoryFailsOnRegression();

console.log("check-ui-governance-health tests passed");
