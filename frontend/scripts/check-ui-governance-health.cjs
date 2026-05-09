#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { buildResult } = require("./check-ui-governance.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultBaselinePath = path.join(repoRoot, "reports/ui-governance-health-baseline.json");

function parseArgs(argv) {
  const args = {
    baselinePath: defaultBaselinePath,
    json: false,
    strictAdvisory: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--strict-advisory") {
      args.strictAdvisory = true;
    } else if (arg.startsWith("--baseline=")) {
      const value = arg.split("=").slice(1).join("=");
      args.baselinePath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node frontend/scripts/check-ui-governance-health.cjs [options]

Options:
  --baseline=PATH       Baseline JSON path. Defaults to reports/ui-governance-health-baseline.json.
  --json                Print machine-readable health result.
  --strict-advisory     Exit nonzero when advisory metrics regress beyond the baseline.
  -h, --help            Show this help.
`);
}

function readBaseline(baselinePath) {
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function countMetric(metrics, section, key) {
  return metrics.counts?.[section]?.[key] || 0;
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function hardChecks(metrics, baseline) {
  const hardLimits = baseline.hardLimits || {};
  const checks = [
    {
      id: "blocking-findings",
      label: "Blocking P0/P1 findings",
      current: metrics.counts.blockingFindings,
      limit: hardLimits.blockingFindings ?? 0,
    },
    {
      id: "p0-findings",
      label: "P0 findings",
      current: countMetric(metrics, "bySeverity", "P0"),
      limit: hardLimits.P0 ?? 0,
    },
    {
      id: "p1-findings",
      label: "P1 findings",
      current: countMetric(metrics, "bySeverity", "P1"),
      limit: hardLimits.P1 ?? 0,
    },
    {
      id: "deprecated-production",
      label: "Deprecated production usage",
      current: metrics.deprecated.total,
      limit: hardLimits.deprecatedProduction ?? 0,
    },
    {
      id: "unsafe-navigation",
      label: "Navigation findings",
      current: countMetric(metrics, "byCategory", "navigation"),
      limit: hardLimits.navigationFindings ?? 0,
    },
    {
      id: "virtualization-blockers",
      label: "Virtualization findings",
      current: countMetric(metrics, "byCategory", "virtualization"),
      limit: hardLimits.virtualizationFindings ?? 0,
    },
    {
      id: "aurora-theme-findings",
      label: "auroraTheme findings",
      current: countMetric(metrics, "byRule", "UI009"),
      limit: hardLimits.auroraThemeFindings ?? 0,
    },
    {
      id: "decorative-background-findings",
      label: "Decorative background findings",
      current: countMetric(metrics, "byRule", "UI011"),
      limit: hardLimits.decorativeBackgroundFindings ?? 0,
    },
  ];

  return checks.map((check) => ({
    ...check,
    status: check.current <= check.limit ? "pass" : "fail",
  }));
}

function advisoryChecks(metrics, baseline, strictAdvisory) {
  const advisoryCeilings = baseline.advisoryCeilings || {};
  const coverageFloors = baseline.coverageFloors || {};
  const ceilingChecks = [
    {
      id: "total-findings",
      label: "Total governance findings",
      current: metrics.counts.findings,
      limit: advisoryCeilings.totalFindings,
    },
    {
      id: "advisory-findings",
      label: "Advisory findings",
      current: countMetric(metrics, "byStatus", "advisory"),
      limit: advisoryCeilings.advisoryFindings,
    },
    {
      id: "quarantine-findings",
      label: "Quarantine findings",
      current: countMetric(metrics, "byStatus", "quarantine"),
      limit: advisoryCeilings.quarantineFindings,
    },
    {
      id: "token-adoption-findings",
      label: "Token adoption advisories",
      current: countMetric(metrics, "byCategory", "token-adoption"),
      limit: advisoryCeilings.tokenAdoptionFindings,
    },
    {
      id: "accessibility-findings",
      label: "Accessibility advisories",
      current: countMetric(metrics, "byCategory", "accessibility"),
      limit: advisoryCeilings.accessibilityFindings,
    },
    {
      id: "motion-findings",
      label: "Motion advisories",
      current: countMetric(metrics, "byCategory", "motion"),
      limit: advisoryCeilings.motionFindings,
    },
  ];
  const floorChecks = [
    {
      id: "token-adoption-coverage",
      label: "Token adoption estimate",
      current: metrics.tokenAdoption.estimatedFileAdoption,
      floor: coverageFloors.tokenAdoptionEstimate,
      format: roundPercent,
    },
    {
      id: "accessibility-coverage",
      label: "Accessibility file coverage",
      current: metrics.accessibility.estimatedFileCoverage,
      floor: coverageFloors.accessibilityFileCoverage,
      format: roundPercent,
    },
    {
      id: "reduced-motion-coverage",
      label: "Reduced-motion coverage",
      current: metrics.reducedMotion.coverage,
      floor: coverageFloors.reducedMotionCoverage,
      format: roundPercent,
    },
    {
      id: "virtualization-coverage",
      label: "Virtualization coverage",
      current: metrics.virtualization.coverage,
      floor: coverageFloors.virtualizationCoverage,
      format: roundPercent,
    },
  ];

  return [
    ...ceilingChecks.map((check) => {
      const hasLimit = Number.isFinite(check.limit);
      const regressed = hasLimit && check.current > check.limit;
      return {
        ...check,
        status: regressed ? (strictAdvisory ? "fail" : "warn") : "pass",
      };
    }),
    ...floorChecks.map((check) => {
      const hasFloor = Number.isFinite(check.floor);
      const regressed = hasFloor && check.current < check.floor;
      return {
        ...check,
        status: regressed ? (strictAdvisory ? "fail" : "warn") : "pass",
      };
    }),
  ];
}

function evaluateHealth(result, baseline, options = {}) {
  const metrics = result.metrics;
  const hard = hardChecks(metrics, baseline);
  const advisory = advisoryChecks(metrics, baseline, Boolean(options.strictAdvisory));
  const failed = [...hard, ...advisory].filter((check) => check.status === "fail");
  const warned = advisory.filter((check) => check.status === "warn");

  return {
    generatedAt: new Date().toISOString(),
    status: failed.length > 0 ? "fail" : warned.length > 0 ? "warn" : "pass",
    baseline: {
      path: baseline.path,
      updatedAt: baseline.updatedAt,
    },
    hard,
    advisory,
    metrics,
  };
}

function formatCheck(check) {
  const format = check.format || ((value) => String(value));
  const target =
    check.limit !== undefined
      ? `limit ${format(check.limit)}`
      : `floor ${format(check.floor)}`;
  return `${check.status.toUpperCase()} ${check.label}: ${format(check.current)} (${target})`;
}

function printHuman(result) {
  console.log("UI governance health");
  console.log(`Status: ${result.status.toUpperCase()}`);
  console.log(`Baseline: ${result.baseline.path}`);
  console.log("");
  console.log("Hard gates");
  result.hard.forEach((check) => console.log(`- ${formatCheck(check)}`));
  console.log("");
  console.log("Advisory trend gates");
  result.advisory.forEach((check) => console.log(`- ${formatCheck(check)}`));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = readBaseline(args.baselinePath);
  baseline.path = path.relative(repoRoot, args.baselinePath).replace(/\\/g, "/");
  const health = evaluateHealth(buildResult({ changed: false }), baseline, {
    strictAdvisory: args.strictAdvisory,
  });

  if (args.json) {
    console.log(JSON.stringify(health, null, 2));
  } else {
    printHuman(health);
  }

  if (health.status === "fail") {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  advisoryChecks,
  evaluateHealth,
  hardChecks,
  parseArgs,
};
