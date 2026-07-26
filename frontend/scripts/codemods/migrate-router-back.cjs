#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const frontendRoot = path.join(repoRoot, "frontend");
const targetRoots = ["app", "src/components", "src/screens", "src/domains"].map((root) =>
  path.join(frontendRoot, root)
);
const validExtensions = new Set([".ts", ".tsx"]);

function parseArgs(argv) {
  const args = {
    write: false,
    fallbackHref: null,
  };

  for (const arg of argv) {
    if (arg === "--write") {
      args.write = true;
    } else if (arg.startsWith("--fallback=")) {
      args.fallbackHref = arg.slice("--fallback=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.write && !args.fallbackHref) {
    throw new Error("--write requires --fallback=/route so workflow recovery is explicit.");
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/codemods/migrate-router-back.cjs [options]

Options:
  --write              Apply low-risk replacements.
  --fallback=/route    Required with --write. Fallback route for safeBackNavigation().

Default mode is dry-run. Review each candidate before using --write.
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

function insertSafeBackImport(source) {
  if (source.includes("safeBackNavigation")) return source;

  const aliasImport = 'import { safeBackNavigation } from "@/utils/navigation";';
  const lines = source.split(/\r?\n/);
  const lastImportIndex = lines.findLastIndex((line) => line.startsWith("import "));
  lines.splice(Math.max(lastImportIndex + 1, 0), 0, aliasImport);
  return lines.join("\n");
}

function transformSource(source, fallbackHref) {
  if (!source.includes("router.back()")) return source;
  const replacement = `safeBackNavigation(router, { fallbackHref: "${fallbackHref}" })`;
  return insertSafeBackImport(source).replace(/\brouter\.back\(\)/g, replacement);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidates = [];

  for (const file of targetRoots.flatMap(walk)) {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes("router.back()")) {
      candidates.push(file);
    }
  }

  if (candidates.length === 0) {
    console.log("No router.back() candidates found.");
    return;
  }

  console.log(`router.back() candidates: ${candidates.length}`);
  for (const file of candidates) {
    console.log(`- ${toRepoPath(file)}`);
  }

  if (!args.write) {
    console.log("");
    console.log("Dry-run only. Re-run with --write --fallback=/route after selecting a safe fallback.");
    return;
  }

  for (const file of candidates) {
    const source = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, transformSource(source, args.fallbackHref));
  }

  console.log(`Updated ${candidates.length} files.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
