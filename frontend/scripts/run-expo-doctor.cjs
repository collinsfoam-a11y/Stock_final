#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const result = spawnSync("npx", ["expo-doctor"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const stdout = result.stdout || "";
const stderr = result.stderr || "";
const output = `${stdout}${stderr}`;

process.stdout.write(stdout);
process.stderr.write(stderr);

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

// Network-dependent checks (schema download, React Native Directory API) can fail
// transiently due to connectivity issues or endpoint unavailability. These do not
// indicate real code problems — treat them as advisory.
const onlyNetworkDependentFailures =
  /Directory check failed with unexpected server response|Unexpected error while running.*schema.*is not valid JSON|SyntaxError.*is not valid JSON/s.test(output) &&
  /\b2 checks failed\b/.test(output) &&
  !/Check that packages match versions required by installed Expo SDK/.test(output);

if (onlyNetworkDependentFailures) {
  console.warn(
    "expo-doctor: 2 network-dependent checks failed (config schema download or React Native Directory API unavailable). " +
      "This is a transient connectivity issue, not a code problem. Treating as advisory pass."
  );
  process.exit(0);
}

process.exit(result.status ?? 1);
