#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const exportDir = path.join(projectRoot, "dist");

try {
  fs.rmSync(exportDir, { recursive: true, force: true });
  console.log(`Cleaned ${path.relative(projectRoot, exportDir)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
