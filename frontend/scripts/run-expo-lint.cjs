#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "expo-lint-pnpm-"));
const legacyConfigPath = path.join(process.cwd(), ".eslint-legacy-temp.cjs");

try {
  const shimScript = `
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = process.argv.slice(2);
let npmArgs;

if (args[0] === "--version" || args[0] === "-v") {
  npmArgs = ["--version"];
} else if (args[0] === "run") {
  npmArgs = args;
} else if (args[0] === "exec") {
  npmArgs = ["exec", "--", ...args.slice(1)];
} else {
  npmArgs = ["exec", "--", ...args];
}

const npmExecPath = process.env.npm_execpath;
const useNpmCli = Boolean(
  npmExecPath &&
    !path.basename(npmExecPath).toLowerCase().startsWith("pnpm") &&
    !path.basename(npmExecPath).toLowerCase().startsWith("yarn")
);
const command = useNpmCli ? process.execPath : npmCommand;
const commandArgs = useNpmCli ? [npmExecPath, ...npmArgs] : npmArgs;

const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  cwd: process.cwd(),
  shell: !useNpmCli && process.platform === "win32",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
`;
  const shimScriptPath = path.join(tempDir, "pnpm-shim.cjs");
  fs.writeFileSync(shimScriptPath, shimScript);

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(tempDir, "pnpm.cmd"), '@echo off\r\nnode "%~dp0pnpm-shim.cjs" %*\r\n');
  } else {
    const shimPath = path.join(tempDir, "pnpm");
    fs.writeFileSync(shimPath, `#!/bin/sh\nexec node "${shimScriptPath}" "$@"\n`);
    fs.chmodSync(shimPath, 0o755);
  }

  fs.copyFileSync(path.join(process.cwd(), ".eslintrc.js.legacy"), legacyConfigPath);

  const result = spawnSync(
    npxCommand,
    [
      "eslint",
      ".",
      "--ext",
      ".js,.jsx,.ts,.tsx",
      "--config",
      legacyConfigPath,
      "--no-error-on-unmatched-pattern",
      "--ignore-pattern",
      ".expo/**",
      "--ignore-pattern",
      "dist/**",
      "--ignore-pattern",
      "build/**",
      "--ignore-pattern",
      "coverage/**",
      "--ignore-pattern",
      "android/**",
      "--ignore-pattern",
      "ios/**",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ESLINT_USE_FLAT_CONFIG: "false",
        PATH: `${tempDir}${path.delimiter}${process.env.PATH || ""}`,
      },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");

  if (result.error) {
    console.error(`Failed to run expo lint via ${npxCommand}: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
} finally {
  fs.rmSync(legacyConfigPath, { force: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
}
