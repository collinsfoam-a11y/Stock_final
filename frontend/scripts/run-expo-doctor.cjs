#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const spawnOptions = {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
};

const result =
  process.platform === "win32"
    ? spawnSync(`${npxCommand} expo-doctor`, { ...spawnOptions, shell: true })
    : spawnSync(npxCommand, ["expo-doctor"], spawnOptions);

const stdout = result.stdout || "";
const stderr = result.stderr || "";
const output = `${stdout}${stderr}`;

process.stdout.write(stdout);
process.stderr.write(stderr);

if (result.error) {
  console.error(`Failed to run expo-doctor via ${npxCommand}: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0) {
  process.exit(0);
}

const knownMissingLegacyDependency =
  /Failed to find dependency tree for (?:@unimodules\/core|@unimodules\/react-native-adapter|react-native-unimodules):/.test(
    output
  );
const knownMissingLegacyCli = /Failed to find dependency tree for expo-cli:/.test(output);
const onlyKnownMissingLegacyChecks =
  knownMissingLegacyDependency &&
  knownMissingLegacyCli &&
  /\b2 checks failed\b/.test(output) &&
  !/Check that packages match versions required by installed Expo SDK/.test(output);

if (onlyKnownMissingLegacyChecks) {
  console.warn(
    "expo-doctor reported only missing deprecated legacy packages. Treating this as pass because those packages must not be installed in SDK 55 projects."
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
