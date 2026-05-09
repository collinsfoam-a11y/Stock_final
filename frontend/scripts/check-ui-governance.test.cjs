#!/usr/bin/env node

const assert = require("node:assert/strict");

const { parseChangedLineMap, scanText } = require("./check-ui-governance.cjs");

function ids(findings) {
  return findings.map((finding) => finding.id);
}

function testChangedLineParsing() {
  const diff = [
    "diff --git a/frontend/app/example.tsx b/frontend/app/example.tsx",
    "+++ b/frontend/app/example.tsx",
    "@@ -10,0 +11,2 @@",
    "+const color = '#fff';",
    "+router.back();",
  ].join("\n");

  const map = parseChangedLineMap(diff);
  assert.deepEqual([...map.get("frontend/app/example.tsx")], [11, 12]);
}

function testForbiddenPatterns() {
  const findings = scanText(
    "frontend/app/staff/example.tsx",
    [
      "import { auroraTheme } from '@/theme/auroraTheme';",
      "const color = '#ff00ff';",
      "router.back();",
      "<ScreenContainer backgroundType=\"aurora\" />",
      "<ModernButton variant=\"gradient\" title=\"Save\" onPress={save} />",
    ].join("\n")
  );

  const findingIds = ids(findings);
  assert.ok(findingIds.includes("UI009"), "auroraTheme import must be reported");
  assert.ok(findingIds.includes("UI002"), "hardcoded color must be reported");
  assert.ok(findingIds.includes("UI013"), "router.back must be reported");
  assert.ok(findingIds.includes("UI011"), "decorative background must be reported");
  assert.ok(findingIds.includes("UI012"), "gradient variant must be reported");
}

function testChangedLineScope() {
  const findings = scanText(
    "frontend/app/staff/example.tsx",
    ["const oldColor = '#fff';", "const next = true;", "router.back();"].join("\n"),
    { changedLines: new Set([2]) }
  );

  assert.deepEqual(findings, []);
}

function testAllowedAppearanceDebt() {
  const findings = scanText(
    "frontend/app/staff/appearance.tsx",
    ["<ScreenContainer backgroundType=\"aurora\" />", "<ModernCard variant=\"gradient\" />"].join(
      "\n"
    )
  );

  assert.equal(findings.find((finding) => finding.id === "UI011"), undefined);
  assert.equal(findings.find((finding) => finding.id === "UI012")?.status, "deprecated");
}

testChangedLineParsing();
testForbiddenPatterns();
testChangedLineScope();
testAllowedAppearanceDebt();

console.log("check-ui-governance tests passed");
