process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const jestBin = path.join(__dirname, "..", "node_modules", "jest", "bin", "jest.js");
const args = ["--no-warnings", "--experimental-vm-modules", jestBin, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
