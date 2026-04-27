const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const budgetPath = path.join(projectRoot, "budget.json");
const webBundleDir = path.join(projectRoot, "dist", "_expo", "static", "js", "web");

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function readScriptBudgetKb() {
  if (!fs.existsSync(budgetPath)) {
    return null;
  }

  const budgetConfig = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
  const firstBudget = Array.isArray(budgetConfig) ? budgetConfig[0] : null;
  const scriptBudget = firstBudget?.resourceSizes?.find(
    (entry) => entry.resourceType === "script",
  );

  return typeof scriptBudget?.budget === "number" ? scriptBudget.budget : null;
}

function getBundleStats() {
  if (!fs.existsSync(webBundleDir)) {
    throw new Error(
      `Web bundle directory not found: ${path.relative(projectRoot, webBundleDir)}`,
    );
  }

  const jsFiles = fs
    .readdirSync(webBundleDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const fullPath = path.join(webBundleDir, file);
      const sizeBytes = fs.statSync(fullPath).size;
      return {
        file,
        sizeBytes,
      };
    })
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  const mainBundle = jsFiles.find((file) => file.file.startsWith("index-")) ?? null;
  const totalBytes = jsFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  return {
    jsFiles,
    mainBundle,
    totalBytes,
  };
}

function main() {
  const { jsFiles, mainBundle, totalBytes } = getBundleStats();
  const scriptBudgetKb = readScriptBudgetKb();
  const strict = process.argv.includes("--strict");

  console.log(`Web bundles: ${jsFiles.length}`);
  console.log(`Total JS: ${formatKb(totalBytes)}`);

  if (mainBundle) {
    console.log(`Main bundle: ${mainBundle.file} (${formatKb(mainBundle.sizeBytes)})`);
  } else {
    console.log("Main bundle: not found");
  }

  if (scriptBudgetKb == null || !mainBundle) {
    return;
  }

  const mainBundleKb = mainBundle.sizeBytes / 1024;
  const overBudgetKb = mainBundleKb - scriptBudgetKb;

  if (overBudgetKb <= 0) {
    console.log(`Bundle budget: PASS (${mainBundleKb.toFixed(1)} / ${scriptBudgetKb} kB)`);
    return;
  }

  const message =
    `Bundle budget: OVER by ${overBudgetKb.toFixed(1)} kB ` +
    `(${mainBundleKb.toFixed(1)} / ${scriptBudgetKb} kB)`;

  if (strict) {
    throw new Error(message);
  }

  console.warn(message);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
