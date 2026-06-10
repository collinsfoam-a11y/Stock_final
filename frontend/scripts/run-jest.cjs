process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const jestBin = path.join(__dirname, "..", "node_modules", "jest", "bin", "jest.js");
// --forceExit: the auth heartbeat uses a real setInterval that can't be unref'd
// in RN, so a lingering tick keeps Jest from exiting (process exit 1) even when
// every test passes. Force a clean exit after the run. (Does NOT mask failures —
// a failing test still sets a nonzero exit code.)
const args = [
  "--no-warnings",
  "--experimental-vm-modules",
  jestBin,
  "--forceExit",
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
