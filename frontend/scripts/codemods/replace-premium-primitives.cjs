#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const frontendRoot = path.join(repoRoot, "frontend");
const targetRoots = ["app", "src/components", "src/screens", "src/domains"].map((root) =>
  path.join(frontendRoot, root)
);
const validExtensions = new Set([".ts", ".tsx"]);

const replacements = [
  ["PremiumButton", "AppButton"],
  ["PremiumCard", "AppCard"],
  ["PremiumInput", "AppInput"],
];

function parseArgs(argv) {
  const args = { write: false };
  for (const arg of argv) {
    if (arg === "--write") {
      args.write = true;
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
  console.log(`Usage: node scripts/codemods/replace-premium-primitives.cjs [options]

Options:
  --write    Apply safe Premium* primitive replacements.

Default mode is dry-run. Review candidates before using --write.
`);
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && validExtensions.has(path.extname(entry.name))) return [fullPath];
    return [];
  });
}

function toRepoPath(fullPath) {
  return path.relative(repoRoot, fullPath).replace(/\\/g, "/");
}

function isFacadeOrRegistry(fullPath) {
  const repoPath = toRepoPath(fullPath);
  return (
    repoPath.startsWith("frontend/src/components/premium/") ||
    repoPath === "frontend/src/components/ui/legacyVisualSystem.ts"
  );
}

function hasPremiumUsage(source) {
  return replacements.some(([legacy]) => new RegExp(`\\b${legacy}\\b`).test(source));
}

function addUiImports(source, imports) {
  if (imports.length === 0) return source;
  const importLine = `import { ${imports.join(", ")} } from "@/components/ui";`;
  if (source.includes(importLine)) return source;

  const lines = source.split(/\r?\n/);
  const lastImportIndex = lines.findLastIndex((line) => line.startsWith("import "));
  lines.splice(Math.max(lastImportIndex + 1, 0), 0, importLine);
  return lines.join("\n");
}

function transformSource(source) {
  let next = source;
  const neededImports = [];

  for (const [legacy, approved] of replacements) {
    if (!new RegExp(`\\b${legacy}\\b`).test(next)) continue;
    next = next.replace(new RegExp(`\\b${legacy}\\b`, "g"), approved);
    neededImports.push(approved);
  }

  next = next.replace(
    /import\s+\{[^}]*App(?:Button|Card|Input)[^}]*\}\s+from\s+["'][^"']*components\/premium["'];?\n?/g,
    ""
  );
  next = next.replace(
    /import\s+\{[^}]*App(?:Button|Card|Input)[^}]*\}\s+from\s+["'][^"']*\/premium["'];?\n?/g,
    ""
  );

  return addUiImports(next, [...new Set(neededImports)].sort());
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidates = [];

  for (const file of targetRoots.flatMap(walk)) {
    if (isFacadeOrRegistry(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (hasPremiumUsage(source)) {
      candidates.push(file);
    }
  }

  if (candidates.length === 0) {
    console.log("No Premium* primitive candidates found.");
    return;
  }

  console.log(`Premium* primitive candidates: ${candidates.length}`);
  for (const file of candidates) {
    console.log(`- ${toRepoPath(file)}`);
  }

  if (!args.write) {
    console.log("");
    console.log("Dry-run only. Re-run with --write after reviewing candidates.");
    return;
  }

  for (const file of candidates) {
    fs.writeFileSync(file, transformSource(fs.readFileSync(file, "utf8")));
  }

  console.log(`Updated ${candidates.length} files.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
