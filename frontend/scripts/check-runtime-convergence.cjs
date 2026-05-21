#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultBaselinePath = path.join(repoRoot, "reports/runtime-convergence-baseline.json");

const SCAN_ROOTS = ["frontend/app", "frontend/src"];
const VALID_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDE_PARTS = [
  "__tests__",
  "__mocks__",
  ".test.",
  ".spec.",
  ".stories.",
  "node_modules",
  "dist",
  ".expo",
];

const WRAPPER_INVENTORY = [
  {
    path: "frontend/src/services/offline/syncService.ts",
    classification: "compatibility-only",
    canonical: "frontend/src/services/syncService.ts",
  },
  {
    path: "frontend/src/components/ui/Toast.tsx",
    classification: "compatibility-only",
    canonical: "frontend/src/components/feedback/ToastProvider.tsx",
  },
  {
    path: "frontend/src/theme/legacyCompat.ts",
    classification: "quarantine",
    canonical: "frontend/src/hooks/useUiTokens.ts",
  },
  {
    path: "frontend/src/theme/auroraTheme.ts",
    classification: "quarantine",
    canonical: "frontend/src/theme/themeTokens.ts",
  },
  {
    path: "frontend/src/theme/uiStandard.ts",
    classification: "quarantine",
    canonical: "frontend/src/theme/themeTokens.ts",
  },
  {
    path: "frontend/src/services/offlineQueue.ts",
    classification: "compatibility-only",
    canonical: "frontend/src/services/offline/offlineQueue.ts",
  },
];

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
  console.log(`Usage: node frontend/scripts/check-runtime-convergence.cjs [options]

Options:
  --baseline=PATH       Baseline JSON path. Defaults to reports/runtime-convergence-baseline.json.
  --json                Print machine-readable result.
  --strict-advisory     Exit nonzero when advisory metrics regress beyond the baseline.
  -h, --help            Show this help.
`);
}

function shouldSkip(relPath) {
  if (EXCLUDE_PARTS.some((part) => relPath.includes(part))) {
    return true;
  }
  return !VALID_EXTENSIONS.has(path.extname(relPath));
}

function walkFiles(rootRelPath, files) {
  const rootAbsPath = path.join(repoRoot, rootRelPath);
  if (!fs.existsSync(rootAbsPath)) {
    return;
  }

  const entries = fs.readdirSync(rootAbsPath, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(rootAbsPath, entry.name);
    const relPath = path.relative(repoRoot, absPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      walkFiles(relPath, files);
      continue;
    }
    if (!shouldSkip(relPath)) {
      files.push(relPath);
    }
  }
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function collectMetrics() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    walkFiles(root, files);
  }

  const counts = {
    filesScanned: files.length,
    imports: {
      offlineSyncService: 0,
      uiToast: 0,
      legacyCompat: 0,
      modernDesignSystem: 0,
    },
    runtime: {
      setInterval: 0,
      addEventListener: 0,
      removeEventListener: 0,
      netInfoAddListener: 0,
      appStateAddListener: 0,
      syncOrchestratorOwners: 0,
      intervalOwnerFiles: 0,
    },
    wrappers: {
      totalTracked: WRAPPER_INVENTORY.length,
      existing: 0,
      compatibilityOnly: 0,
      quarantine: 0,
    },
    telemetry: {
      implementationOwners: 0,
      blockingTrackCalls: 0,
      directNetworkCalls: 0,
      screenLocalBuffers: 0,
    },
  };

  const syncOrchestratorOwners = new Set();
  const intervalOwnerCounts = new Map();

  for (const file of files) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");

    counts.imports.offlineSyncService += countMatches(content, /services\/offline\/syncService/g);
    counts.imports.uiToast += countMatches(content, /components\/ui\/Toast/g);
    counts.imports.legacyCompat += countMatches(content, /theme\/legacyCompat/g);
    counts.imports.modernDesignSystem += countMatches(content, /styles\/modernDesignSystem/g);

    const intervalMatches = countMatches(content, /setInterval\s*\(/g);
    counts.runtime.setInterval += intervalMatches;
    counts.runtime.addEventListener += countMatches(content, /\.addEventListener\s*\(/g);
    counts.runtime.removeEventListener += countMatches(content, /\.removeEventListener\s*\(/g);
    counts.runtime.netInfoAddListener += countMatches(content, /NetInfo\.addEventListener\s*\(/g);
    counts.runtime.appStateAddListener += countMatches(content, /AppState\.addEventListener\s*\(/g);

    const isTelemetryOwner = file === "frontend/src/services/observability/operationalTelemetry.ts";
    if (/class\s+OperationalTelemetryService\b/.test(content)) {
      counts.telemetry.implementationOwners += 1;
    }
    if (/new\s+OperationalTelemetryService\s*\(/.test(content) && !isTelemetryOwner) {
      counts.telemetry.implementationOwners += 1;
    }
    counts.telemetry.blockingTrackCalls += countMatches(
      content,
      /await\s+operationalTelemetry\.(track|trackScanner|trackQueue|trackRuntime|markEnd|persistNow)\b/g,
    );
    counts.telemetry.directNetworkCalls += countMatches(
      content,
      /(fetch|sendBeacon)\s*\([^;\n]*(telemetry|analytics|observability)/gi,
    );
    if (file.startsWith("frontend/app/")) {
      counts.telemetry.screenLocalBuffers += countMatches(
        content,
        /const\s+\w*(telemetry|analytics|metric)\w*\s*=\s*(\[\]|new\s+(Map|Set)\s*\()/gi,
      );
    }

    if (intervalMatches > 0) {
      intervalOwnerCounts.set(file, intervalMatches);
    }

    if (
      file.startsWith("frontend/src/services/") &&
      /export\s+(const|function)\s+startSyncService\b/.test(content) &&
      /setInterval\s*\(/.test(content)
    ) {
      syncOrchestratorOwners.add(file);
    }
  }

  counts.runtime.syncOrchestratorOwners = syncOrchestratorOwners.size;
  counts.runtime.intervalOwnerFiles = intervalOwnerCounts.size;

  const wrappers = WRAPPER_INVENTORY.map((wrapper) => {
    const absPath = path.join(repoRoot, wrapper.path);
    const exists = fs.existsSync(absPath);
    const source = exists ? fs.readFileSync(absPath, "utf8") : "";
    const isThinShim =
      exists &&
      !/setInterval\s*\(/.test(source) &&
      !/syncOfflineQueue\s*\(/.test(source) &&
      !/useSettingsStore/.test(source);

    if (exists) {
      counts.wrappers.existing += 1;
      if (wrapper.classification === "compatibility-only") {
        counts.wrappers.compatibilityOnly += 1;
      }
      if (wrapper.classification === "quarantine") {
        counts.wrappers.quarantine += 1;
      }
    }

    return {
      ...wrapper,
      exists,
      isThinShim,
    };
  });

  const offlineSyncWrapper = wrappers.find(
    (wrapper) => wrapper.path === "frontend/src/services/offline/syncService.ts",
  );

  return {
    generatedAt: new Date().toISOString(),
    counts,
    topIntervalOwners: [...intervalOwnerCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([file, count]) => ({ file, count })),
    wrappers,
    flags: {
      offlineSyncWrapperIsThinShim: Boolean(offlineSyncWrapper?.isThinShim),
    },
  };
}

function readBaseline(baselinePath) {
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function hardChecks(metrics, baseline) {
  const limits = baseline.hardLimits || {};

  const checks = [
    {
      id: "offline-sync-imports",
      label: "Legacy offline sync imports",
      current: metrics.counts.imports.offlineSyncService,
      limit: limits.offlineSyncImports ?? 0,
    },
    {
      id: "ui-toast-imports",
      label: "Legacy ui/Toast imports",
      current: metrics.counts.imports.uiToast,
      limit: limits.uiToastImports ?? 0,
    },
    {
      id: "sync-orchestrator-owners",
      label: "Sync orchestrator owner count",
      current: metrics.counts.runtime.syncOrchestratorOwners,
      limit: limits.syncOrchestratorOwners ?? 1,
    },
    {
      id: "offline-sync-wrapper-shim",
      label: "Offline sync wrapper stays shim-only",
      current: metrics.flags.offlineSyncWrapperIsThinShim ? 0 : 1,
      limit: limits.offlineSyncWrapperNonShim ?? 0,
    },
    {
      id: "telemetry-owner-count",
      label: "Operational telemetry implementation owner count",
      current: metrics.counts.telemetry.implementationOwners,
      limit: limits.telemetryImplementationOwners ?? 1,
    },
    {
      id: "telemetry-blocking-calls",
      label: "Blocking operational telemetry calls",
      current: metrics.counts.telemetry.blockingTrackCalls,
      limit: limits.telemetryBlockingTrackCalls ?? 0,
    },
    {
      id: "telemetry-network-calls",
      label: "Direct telemetry network calls",
      current: metrics.counts.telemetry.directNetworkCalls,
      limit: limits.telemetryDirectNetworkCalls ?? 0,
    },
    {
      id: "screen-local-telemetry-buffers",
      label: "Screen-local telemetry buffers",
      current: metrics.counts.telemetry.screenLocalBuffers,
      limit: limits.screenLocalTelemetryBuffers ?? 0,
    },
  ];

  return checks.map((check) => ({
    ...check,
    status: check.current <= check.limit ? "pass" : "fail",
  }));
}

function advisoryChecks(metrics, baseline, strictAdvisory) {
  const ceilings = baseline.advisoryCeilings || {};
  const checks = [
    {
      id: "legacy-compat-imports",
      label: "legacyCompat import references",
      current: metrics.counts.imports.legacyCompat,
      limit: ceilings.legacyCompatImports,
    },
    {
      id: "modern-design-imports",
      label: "modernDesignSystem import references",
      current: metrics.counts.imports.modernDesignSystem,
      limit: ceilings.modernDesignSystemImports,
    },
    {
      id: "setinterval-count",
      label: "setInterval usage count",
      current: metrics.counts.runtime.setInterval,
      limit: ceilings.setIntervalCount,
    },
    {
      id: "event-listener-count",
      label: "addEventListener usage count",
      current: metrics.counts.runtime.addEventListener,
      limit: ceilings.addEventListenerCount,
    },
    {
      id: "appstate-listener-count",
      label: "AppState listener usage count",
      current: metrics.counts.runtime.appStateAddListener,
      limit: ceilings.appStateAddListenerCount,
    },
    {
      id: "interval-owner-files",
      label: "Interval owner file count",
      current: metrics.counts.runtime.intervalOwnerFiles,
      limit: ceilings.intervalOwnerFileCount,
    },
    {
      id: "wrapper-count",
      label: "Tracked wrapper file count",
      current: metrics.counts.wrappers.existing,
      limit: ceilings.wrapperFileCount,
    },
  ];

  return checks.map((check) => {
    const hasLimit = Number.isFinite(check.limit);
    const regressed = hasLimit && check.current > check.limit;
    return {
      ...check,
      status: regressed ? (strictAdvisory ? "fail" : "warn") : "pass",
    };
  });
}

function evaluateConvergence(metrics, baseline, options = {}) {
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
  return `${check.status.toUpperCase()} ${check.label}: ${check.current} (limit ${check.limit})`;
}

function printHuman(result) {
  console.log("Runtime convergence health");
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
  const metrics = collectMetrics();
  const result = evaluateConvergence(metrics, baseline, {
    strictAdvisory: args.strictAdvisory,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  const hasFail = result.hard.some((check) => check.status === "fail");
  const hasAdvisoryFail = result.advisory.some((check) => check.status === "fail");
  if (hasFail || hasAdvisoryFail) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  WRAPPER_INVENTORY,
  advisoryChecks,
  collectMetrics,
  evaluateConvergence,
  hardChecks,
  parseArgs,
};
