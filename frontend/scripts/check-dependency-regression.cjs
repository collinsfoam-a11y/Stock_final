#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const frontendRoot = path.join(repoRoot, "frontend");
const packageJsonPath = path.join(frontendRoot, "package.json");
const defaultBaselinePath = path.join(repoRoot, "reports", "dependency-baseline.json");

function parseArgs(argv) {
  const args = {
    baselinePath: defaultBaselinePath,
    json: false,
    strict: false,
    writeBaseline: false,
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
  console.log(`Usage: node frontend/scripts/check-dependency-regression.cjs [options]

Options:
  --baseline=PATH       Baseline JSON path. Defaults to reports/dependency-baseline.json.
  --write-baseline      Write current dependency snapshot baseline.
  --strict              Fail when dependency growth exceeds baseline limits.
  --json                Print machine-readable result.
  -h, --help            Show this help.
`);
}

function readPackage() {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function readBaseline(baselinePath) {
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function getDependencySnapshot() {
  const pkg = readPackage();
  const dependencies = Object.keys(pkg.dependencies || {}).sort();
  const devDependencies = Object.keys(pkg.devDependencies || {}).sort();
  return {
    dependencies,
    devDependencies,
  };
}

function makeBaseline(snapshot) {
  return {
    updatedAt: new Date().toISOString(),
    ceilings: {
      dependencyCount: snapshot.dependencies.length,
      devDependencyCount: snapshot.devDependencies.length,
      totalCount: snapshot.dependencies.length + snapshot.devDependencies.length,
    },
    knownDependencies: snapshot.dependencies,
    knownDevDependencies: snapshot.devDependencies,
  };
}

function diffLists(current, known) {
  const knownSet = new Set(known);
  return current.filter((item) => !knownSet.has(item));
}

function evaluate(snapshot, baseline) {
  const ceilings = baseline.ceilings || {};
  const knownDependencies = baseline.knownDependencies || [];
  const knownDevDependencies = baseline.knownDevDependencies || [];

  const addedDependencies = diffLists(snapshot.dependencies, knownDependencies);
  const addedDevDependencies = diffLists(snapshot.devDependencies, knownDevDependencies);

  const checks = [
    {
      id: "dependency-count",
      label: "Dependency count",
      current: snapshot.dependencies.length,
      limit: ceilings.dependencyCount,
      status:
        Number.isFinite(ceilings.dependencyCount) &&
        snapshot.dependencies.length > ceilings.dependencyCount
          ? "fail"
          : "pass",
    },
    {
      id: "dev-dependency-count",
      label: "Dev dependency count",
      current: snapshot.devDependencies.length,
      limit: ceilings.devDependencyCount,
      status:
        Number.isFinite(ceilings.devDependencyCount) &&
        snapshot.devDependencies.length > ceilings.devDependencyCount
          ? "fail"
          : "pass",
    },
    {
      id: "total-dependency-count",
      label: "Total dependency count",
      current: snapshot.dependencies.length + snapshot.devDependencies.length,
      limit: ceilings.totalCount,
      status:
        Number.isFinite(ceilings.totalCount) &&
        snapshot.dependencies.length + snapshot.devDependencies.length > ceilings.totalCount
          ? "fail"
          : "pass",
    },
    {
      id: "added-runtime-dependencies",
      label: "New runtime dependencies",
      current: addedDependencies.length,
      limit: 0,
      status: addedDependencies.length > 0 ? "fail" : "pass",
    },
    {
      id: "added-dev-dependencies",
      label: "New dev dependencies",
      current: addedDevDependencies.length,
      limit: 0,
      status: addedDevDependencies.length > 0 ? "fail" : "pass",
    },
  ];

  return {
    status: checks.some((check) => check.status === "fail") ? "fail" : "pass",
    checks,
    addedDependencies,
    addedDevDependencies,
  };
}

function printHuman(result) {
  console.log("Dependency regression report");
  console.log(`Baseline: ${result.baseline.path}`);
  console.log("");
  result.checks.forEach((check) => {
    console.log(
      `- ${check.status.toUpperCase()} ${check.label}: ${check.current} (limit ${check.limit})`,
    );
  });
  if (result.addedDependencies.length > 0) {
    console.log("");
    console.log("New runtime dependencies:");
    result.addedDependencies.forEach((name) => console.log(`- ${name}`));
  }
  if (result.addedDevDependencies.length > 0) {
    console.log("");
    console.log("New dev dependencies:");
    result.addedDevDependencies.forEach((name) => console.log(`- ${name}`));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = getDependencySnapshot();

  if (args.writeBaseline) {
    const baseline = makeBaseline(snapshot);
    fs.mkdirSync(path.dirname(args.baselinePath), { recursive: true });
    fs.writeFileSync(args.baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Wrote dependency baseline to ${path.relative(repoRoot, args.baselinePath)}`);
    return;
  }

  const baseline = readBaseline(args.baselinePath);
  const evaluation = evaluate(snapshot, baseline);
  const result = {
    generatedAt: new Date().toISOString(),
    baseline: {
      path: path.relative(repoRoot, args.baselinePath).replace(/\\/g, "/"),
      updatedAt: baseline.updatedAt || null,
    },
    status: evaluation.status,
    checks: evaluation.checks,
    addedDependencies: evaluation.addedDependencies,
    addedDevDependencies: evaluation.addedDevDependencies,
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (args.strict && result.status === "fail") {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
