const MIN_MAJOR = 20;
const MAX_MAJOR_EXCLUSIVE = 25;

function parseMajor(version) {
  return Number.parseInt(String(version).split(".")[0] ?? "", 10);
}

function isSupportedNodeVersion(version) {
  const major = parseMajor(version);
  return Number.isInteger(major) && major >= MIN_MAJOR && major < MAX_MAJOR_EXCLUSIVE;
}

function formatNodeVersionError(version) {
  return `Node ${MIN_MAJOR}.x-${MAX_MAJOR_EXCLUSIVE - 1}.x is required. Current: ${version}`;
}

function main() {
  const version = process.versions.node;
  if (!isSupportedNodeVersion(version)) {
    console.error(formatNodeVersionError(version));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  formatNodeVersionError,
  isSupportedNodeVersion,
  parseMajor,
};
