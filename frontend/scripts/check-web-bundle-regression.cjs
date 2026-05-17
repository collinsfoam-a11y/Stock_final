#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const frontendRoot = path.join(repoRoot, "frontend");
const webBundleDir = path.join(frontendRoot, "dist", "_expo", "static", "js", "web");
const defaultBaselinePath = path.join(repoRoot, "reports", "web-bundle-baseline.json");

function parseArgs(argv) {
  const args = {
    baselinePath: defaultBaselinePath,
    json: false,
    strict: false,
    writeBaseline: false,
    outputPath: null,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--write-baseline") {
      args.writeBaseline = true;
    } else if (arg.startsWith("--baseline=")) {
      const value = arg.split("=").slice(1).join("=");
      args.baselinePath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
    } else if (arg.startsWith("--output=")) {
      const value = arg.split("=").slice(1).join("=");
      args.outputPath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
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
  console.log(`Usage: node frontend/scripts/check-web-bundle-regression.cjs [options]

Options:
  --baseline=PATH       Baseline JSON path. Defaults to reports/web-bundle-baseline.json.
  --output=PATH         Write JSON result to this file.
  --write-baseline      Write the current metrics to baseline file.
  --strict              Fail when current metrics exceed baseline ceilings.
  --json                Print machine-readable report.
  -h, --help            Show this help.
`);
}

function formatKb(value) {
  return `${value.toFixed(1)} kB`;
}

function readBundles() {
  if (!fs.existsSync(webBundleDir)) {
    throw new Error(
      `Web bundle directory not found: ${path.relative(frontendRoot, webBundleDir)}`,
    );
  }

  return fs
    .readdirSync(webBundleDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const sizeBytes = fs.statSync(path.join(webBundleDir, file)).size;
      return {
        file,
        sizeBytes,
        sizeKb: sizeBytes / 1024,
      };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
}

function getRouteName(file) {
  return file.replace(/-[0-9a-f]{32}\.js$/, "").replace(/\.js$/, "");
}

function buildMetrics() {
  const bundles = readBundles();
  const mainBundle = bundles.find((bundle) => bundle.file.startsWith("index-")) || null;
  const commonBundle = bundles.find((bundle) => bundle.file.startsWith("__common-")) || null;

  const routeChunks = bundles
    .filter(
      (bundle) =>
        !bundle.file.startsWith("__") &&
        !bundle.file.startsWith("index-") &&
        !bundle.file.startsWith("worker-"),
    )
    .map((chunk) => ({
      ...chunk,
      route: getRouteName(chunk.file),
    }));

  const totalJsKb = bundles.reduce((total, bundle) => total + bundle.sizeKb, 0);
  const routeChunkTotalKb = routeChunks.reduce((total, bundle) => total + bundle.sizeKb, 0);
  const largestRouteChunkKb = routeChunks[0] ? routeChunks[0].sizeKb : 0;

  return {
    generatedAt: new Date().toISOString(),
    bundleCount: bundles.length,
    totalJsKb,
    mainBundleKb: mainBundle ? mainBundle.sizeKb : 0,
    commonBundleKb: commonBundle ? commonBundle.sizeKb : 0,
    routeChunkCount: routeChunks.length,
    routeChunkTotalKb,
    largestRouteChunkKb,
    topRouteChunks: routeChunks.slice(0, 12).map((chunk) => ({
      route: chunk.route,
      file: chunk.file,
      sizeKb: Number(chunk.sizeKb.toFixed(2)),
    })),
  };
}

function makeBaseline(metrics) {
  return {
    updatedAt: new Date().toISOString(),
    ceilings: {
      bundleCount: metrics.bundleCount,
      totalJsKb: Number(metrics.totalJsKb.toFixed(2)),
      mainBundleKb: Number(metrics.mainBundleKb.toFixed(2)),
      commonBundleKb: Number(metrics.commonBundleKb.toFixed(2)),
      routeChunkTotalKb: Number(metrics.routeChunkTotalKb.toFixed(2)),
      largestRouteChunkKb: Number(metrics.largestRouteChunkKb.toFixed(2)),
    },
  };
}

function readBaseline(baselinePath) {
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function evaluate(metrics, baseline) {
  const ceilings = baseline.ceilings || {};
  const tolerances = {
    totalJsKb: 20,
    mainBundleKb: 4,
    commonBundleKb: 2.5,
    routeChunkTotalKb: 14,
    largestRouteChunkKb: 1,
  };
  const checks = [
    {
      id: "bundle-count",
      label: "Web bundle file count",
      current: metrics.bundleCount,
      limit: ceilings.bundleCount,
    },
    {
      id: "total-js-kb",
      label: "Total JS size",
      current: Number(metrics.totalJsKb.toFixed(2)),
      limit: ceilings.totalJsKb,
      tolerance: tolerances.totalJsKb,
      unit: "kB",
    },
    {
      id: "main-bundle-kb",
      label: "Main bundle size",
      current: Number(metrics.mainBundleKb.toFixed(2)),
      limit: ceilings.mainBundleKb,
      tolerance: tolerances.mainBundleKb,
      unit: "kB",
    },
    {
      id: "common-bundle-kb",
      label: "Common bundle size",
      current: Number(metrics.commonBundleKb.toFixed(2)),
      limit: ceilings.commonBundleKb,
      tolerance: tolerances.commonBundleKb,
      unit: "kB",
    },
    {
      id: "route-total-kb",
      label: "Route chunk aggregate size",
      current: Number(metrics.routeChunkTotalKb.toFixed(2)),
      limit: ceilings.routeChunkTotalKb,
      tolerance: tolerances.routeChunkTotalKb,
      unit: "kB",
    },
    {
      id: "largest-route-kb",
      label: "Largest route chunk",
      current: Number(metrics.largestRouteChunkKb.toFixed(2)),
      limit: ceilings.largestRouteChunkKb,
      tolerance: tolerances.largestRouteChunkKb,
      unit: "kB",
    },
  ].map((check) => {
    const hasLimit = Number.isFinite(check.limit);
    const tolerance = Number.isFinite(check.tolerance) ? check.tolerance : 0;
    const effectiveLimit = hasLimit ? check.limit + tolerance : check.limit;
    const status = hasLimit && check.current > effectiveLimit ? "fail" : "pass";
    return { ...check, effectiveLimit, status };
  });

  const failed = checks.filter((check) => check.status === "fail");
  return {
    status: failed.length > 0 ? "fail" : "pass",
    checks,
  };
}

function printHuman(metrics, baselinePath, evaluation) {
  console.log("Web bundle regression report");
  console.log(`Baseline: ${baselinePath}`);
  console.log(`Bundle files: ${metrics.bundleCount}`);
  console.log(`Total JS: ${formatKb(metrics.totalJsKb)}`);
  console.log(`Main bundle: ${formatKb(metrics.mainBundleKb)}`);
  console.log(`Common bundle: ${formatKb(metrics.commonBundleKb)}`);
  console.log(`Route chunks: ${metrics.routeChunkCount} (${formatKb(metrics.routeChunkTotalKb)})`);
  console.log(`Largest route chunk: ${formatKb(metrics.largestRouteChunkKb)}`);
  console.log("");
  console.log("Top route chunks");
  metrics.topRouteChunks.forEach((chunk) => {
    console.log(`- ${chunk.route}: ${chunk.sizeKb.toFixed(2)} kB`);
  });
  console.log("");
  console.log("Ceiling checks");
  evaluation.checks.forEach((check) => {
    const unitSuffix = check.unit ? ` ${check.unit}` : "";
    const toleranceSuffix = check.tolerance
      ? `, tolerance ${check.tolerance}${unitSuffix}`
      : "";
    console.log(
      `- ${check.status.toUpperCase()} ${check.label}: ${check.current}${unitSuffix} (limit ${check.limit}${unitSuffix}${toleranceSuffix})`,
    );
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const metrics = buildMetrics();

  if (args.writeBaseline) {
    const baseline = makeBaseline(metrics);
    fs.mkdirSync(path.dirname(args.baselinePath), { recursive: true });
    fs.writeFileSync(args.baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote bundle baseline to ${path.relative(repoRoot, args.baselinePath)}`);
    return;
  }

  const baseline = readBaseline(args.baselinePath);
  const evaluation = evaluate(metrics, baseline);

  const result = {
    generatedAt: new Date().toISOString(),
    baseline: {
      path: path.relative(repoRoot, args.baselinePath).replace(/\\/g, "/"),
      updatedAt: baseline.updatedAt || null,
    },
    status: evaluation.status,
    metrics,
    checks: evaluation.checks,
  };

  if (args.outputPath) {
    fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
    fs.writeFileSync(args.outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(metrics, result.baseline.path, evaluation);
  }

  if (args.strict && evaluation.status === "fail") {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
