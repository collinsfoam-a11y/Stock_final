#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");

const SCAN_ROOTS = [
  "frontend/app",
  "frontend/src/components",
  "frontend/src/screens",
  "frontend/src/domains",
  "frontend/src/hooks",
  "frontend/src/utils",
];

const VALID_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDE_PARTS = [
  "__tests__",
  "__mocks__",
  ".test.",
  ".spec.",
  ".stories.",
  "node_modules",
  "dist",
  ".expo",
];

const DECORATIVE_SURFACES = [
  "AuroraBackground",
  "ParticleField",
  "PatternBackground",
  "GlassCard",
  "PremiumHeader",
];

const LEGACY_VISUAL_IMPORTS = [
  "PremiumButton",
  "PremiumCard",
  "PremiumInput",
  "GlassCard",
  "AuroraBackground",
  "ParticleField",
  "PatternBackground",
  "EnhancedButton",
  "EnhancedInput",
];

const OPERATIONAL_PATH_PATTERN =
  /frontend\/(?:app\/(?:staff|supervisor|admin)|src\/screens\/(?:staff|supervisor)|src\/components\/(?:scan|session|admin|supervisor|navigation))/;

const APPROVED_DECORATIVE_SURFACES = [
  /^frontend\/src\/components\/ui\//,
  /^frontend\/src\/screens\/routes\/WelcomeScreen\.(?:native|web)\.tsx$/,
  /^frontend\/app\/welcome\.tsx$/,
  /^frontend\/app\/(?:staff|supervisor)\/appearance\.tsx$/,
];

const APPROVED_LEGACY_FACADE_FILES = [
  /^frontend\/src\/components\/ui\//,
  /^frontend\/src\/components\/premium\//,
  /^frontend\/src\/components\/forms\/Enhanced(?:Button|TextInput)\.tsx$/,
  /^frontend\/src\/components\/settings\/SettingsScreenPrimitives\.tsx$/,
  /^frontend\/src\/screens\/routes\/WelcomeScreen\.(?:native|web)\.tsx$/,
  /^frontend\/app\/welcome\.tsx$/,
  /^frontend\/app\/(?:staff|supervisor)\/appearance\.tsx$/,
];

const APPROVED_DIRECT_TOUCHABLE_FILES = [
  /^frontend\/src\/components\/ui\//,
  /^frontend\/src\/components\/forms\//,
  /^frontend\/src\/components\/auth\//,
  /^frontend\/src\/components\/navigation\//,
  /^frontend\/src\/components\/settings\/SettingsScreenPrimitives\.tsx$/,
];

const APPROVED_ROUTER_BACK_FILES = [
  /^frontend\/src\/utils\/navigation\/safeBackNavigation\.ts$/,
];

const DENSE_SCREEN_PATTERN =
  /frontend\/(?:app\/admin|app\/supervisor|src\/components\/admin|src\/components\/supervisor|src\/screens\/supervisor)/;

const RULES = {
  DIRECT_LEGACY_THEME_IMPORT: {
    id: "UI001",
    category: "token-adoption",
    severity: "P1",
    title: "Direct legacy theme import",
    guidance:
      "Use useUiTokens, ThemeTokens, ScreenContainer, UnifiedText, or UnifiedView. Keep theme/unified and theme/modernDesign imports inside theme infrastructure.",
  },
  HARDCODED_COLOR: {
    id: "UI002",
    category: "token-adoption",
    severity: "P1",
    title: "Hardcoded color literal",
    guidance:
      "Use semantic tokens for colors. Feature components must not introduce raw hex values.",
  },
  ARBITRARY_Z_INDEX: {
    id: "UI003",
    category: "token-adoption",
    severity: "P1",
    title: "Arbitrary z-index or elevation",
    guidance:
      "Use the centralized z-index/elevation scale. Avoid values such as 9999 or unbounded elevation.",
  },
  DECORATIVE_SURFACE: {
    id: "UI004",
    category: "blocked-pattern",
    severity: "P1",
    title: "Decorative surface in operational UI",
    guidance:
      "Operational screens must avoid aurora backgrounds, glass-heavy layers, particles, and ornamental pattern systems.",
  },
  RAW_SHADOW_PROPS: {
    id: "UI005",
    category: "token-adoption",
    severity: "P2",
    title: "Raw shadow prop",
    guidance:
      "Use tokenized elevation helpers. Web-safe shadow conversion belongs in theme infrastructure.",
  },
  SMALL_TOUCH_TARGET: {
    id: "UI006",
    category: "accessibility",
    severity: "P1",
    title: "Possible small touch target",
    guidance:
      "Interactive controls must expose at least a 44x44 touch target, with 48x48 preferred on Android.",
  },
  GENERIC_ERROR_COPY: {
    id: "UI007",
    category: "error-handling",
    severity: "P1",
    title: "Generic error copy",
    guidance:
      "Failure states must say what failed, why when known, what the user can do next, and how to retry or recover.",
  },
  HOVER_ONLY: {
    id: "UI008",
    category: "accessibility",
    severity: "P2",
    title: "Hover-only interaction",
    guidance:
      "Core actions and operational context cannot depend on hover-only behavior. Mobile and keyboard users need equivalent access.",
  },
  AURORA_THEME_IMPORT: {
    id: "UI009",
    category: "deprecated-usage",
    severity: "P1",
    title: "auroraTheme import outside theme infrastructure",
    guidance:
      "Migrate to useUiTokens or semantic tokens. auroraTheme is a deprecated visual-system bridge.",
  },
  LEGACY_VISUAL_IMPORT: {
    id: "UI010",
    category: "deprecated-usage",
    severity: "P1",
    title: "Legacy visual component family import",
    guidance:
      "Use approved primitives: AppButton, AppCard, AppInput, AppHeader, StatusBadge, ScreenContainer, LoadingState, ErrorState, EmptyState, SyncIndicator, or ConfirmDialog.",
  },
  DECORATIVE_BACKGROUND_PROP: {
    id: "UI011",
    category: "blocked-pattern",
    severity: "P1",
    title: "Decorative background prop",
    guidance:
      "Operational routes must use solid semantic surfaces. Aurora, pattern, particle, and gradient backgrounds are limited to approved non-operational surfaces.",
  },
  GLASS_OR_GRADIENT_VARIANT: {
    id: "UI012",
    category: "blocked-pattern",
    severity: "P1",
    title: "Glass or gradient variant",
    guidance:
      "Use semantic button/card variants. Glass and gradient variants are not approved for operational workflows.",
  },
  UNSAFE_ROUTER_BACK: {
    id: "UI013",
    category: "navigation",
    severity: "P1",
    title: "Unsafe direct router.back()",
    guidance:
      "Use safeBackNavigation() with canGoBack() and a role/workflow-aware fallback route.",
  },
  NON_VIRTUALIZED_DENSE_LIST: {
    id: "UI014",
    category: "virtualization",
    severity: "P1",
    title: "Potential non-virtualized dense list/table",
    guidance:
      "Dense admin, supervisor, recount, and audit lists must use FlatList, FlashList, or another virtualization-safe renderer with stable keys.",
  },
  ARBITRARY_SPACING: {
    id: "UI015",
    category: "token-adoption",
    severity: "P2",
    title: "Arbitrary spacing/radius value",
    guidance:
      "Use centralized spacing, radius, and component tokens. Avoid raw numeric layout values in feature UI.",
  },
  INLINE_ANIMATION_TIMING: {
    id: "UI016",
    category: "motion",
    severity: "P2",
    title: "Inline animation timing",
    guidance:
      "Use tokenized motion timings and reduced-motion checks. Routine operational motion should stay within approved durations.",
  },
  TOUCHABLE_MISSING_ACCESSIBILITY: {
    id: "UI017",
    category: "accessibility",
    severity: "P2",
    title: "Direct touchable lacks explicit accessibility props",
    guidance:
      "Use AppButton/approved primitives or provide accessibilityRole, accessibilityLabel, disabled/loading state, hitSlop, and a 44x44 target.",
  },
};

function parseArgs(argv) {
  const args = {
    changed: false,
    strict: false,
    report: false,
    json: false,
    maxFindings: 120,
  };

  for (const arg of argv) {
    if (arg === "--changed") {
      args.changed = true;
    } else if (arg === "--strict") {
      args.strict = true;
    } else if (arg === "--report") {
      args.report = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg.startsWith("--max-findings=")) {
      const value = Number(arg.split("=")[1]);
      if (Number.isFinite(value) && value >= 0) {
        args.maxFindings = value;
      }
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
  console.log(`Usage: node frontend/scripts/check-ui-governance.cjs [options]

Options:
  --changed              Scan changed frontend UI lines only when git diff metadata is available.
  --strict               Exit nonzero on blocking P0/P1 findings.
  --report               Print migration and category summaries.
  --json                 Print machine-readable JSON.
  --max-findings=N       Print at most N findings. Default: 120.
  -h, --help             Show this help.
`);
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function getDiffSpecs() {
  const specs = [];
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) specs.push([`origin/${baseRef}...HEAD`]);
  specs.push(["origin/main...HEAD"]);
  specs.push(["--cached"]);
  specs.push([]);
  return specs;
}

function getChangedFiles() {
  const changed = new Set();

  for (const spec of getDiffSpecs()) {
    try {
      const output = runGit(["diff", "--name-only", ...spec]);
      if (output) {
        output.split(/\r?\n/).forEach((file) => changed.add(file));
      }
    } catch (_) {
      // Try the next diff strategy.
    }
  }

  return [...changed];
}

function parseChangedLineMap(diffText) {
  const map = new Map();
  let currentFile = null;
  let newLine = 0;

  for (const rawLine of diffText.split(/\r?\n/)) {
    if (rawLine.startsWith("+++ b/")) {
      currentFile = rawLine.slice("+++ b/".length);
      if (!map.has(currentFile)) map.set(currentFile, new Set());
      continue;
    }

    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (!currentFile || rawLine.startsWith("diff --git") || rawLine.startsWith("--- ")) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      map.get(currentFile)?.add(newLine);
      newLine += 1;
    } else if (!rawLine.startsWith("-")) {
      newLine += 1;
    }
  }

  return map;
}

function getChangedLineMap() {
  const merged = new Map();

  for (const spec of getDiffSpecs()) {
    try {
      const output = runGit(["diff", "--unified=0", ...spec]);
      const parsed = parseChangedLineMap(output);
      for (const [file, lines] of parsed) {
        if (!merged.has(file)) merged.set(file, new Set());
        const target = merged.get(file);
        for (const line of lines) target.add(line);
      }
    } catch (_) {
      // Try the next diff strategy.
    }
  }

  return merged;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRepoPath(fullPathOrRepoPath) {
  const normalized = fullPathOrRepoPath.replace(/\\/g, "/");
  if (path.isAbsolute(fullPathOrRepoPath)) {
    return path.relative(repoRoot, fullPathOrRepoPath).replace(/\\/g, "/");
  }
  return normalized;
}

function shouldScan(repoPath) {
  if (!VALID_EXTENSIONS.has(path.extname(repoPath))) return false;
  if (!SCAN_ROOTS.some((root) => repoPath === root || repoPath.startsWith(`${root}/`))) {
    return false;
  }
  return !EXCLUDE_PARTS.some((part) => repoPath.includes(part));
}

function getFiles(changedOnly) {
  if (changedOnly) {
    return getChangedFiles().map(toRepoPath).filter(shouldScan).sort();
  }

  return SCAN_ROOTS.flatMap((root) => walk(path.join(repoRoot, root)))
    .map(toRepoPath)
    .filter(shouldScan)
    .sort();
}

function pathMatches(repoPath, patterns) {
  return patterns.some((pattern) => pattern.test(repoPath));
}

function shouldCheckLine(lineNumber, changedLines) {
  return !changedLines || changedLines.size === 0 || changedLines.has(lineNumber);
}

function isCommentOnlyLine(line) {
  return /^\s*(?:\/\/|\/\*|\*|\*\/)/.test(line);
}

function addFinding(findings, ruleKey, repoPath, lineNumber, line, override = {}) {
  const rule = RULES[ruleKey];
  const status = override.status || (rule.severity === "P0" || rule.severity === "P1" ? "blocking" : "advisory");
  findings.push({
    ...rule,
    ...override,
    status,
    path: repoPath,
    lineNumber,
    line: line.trim(),
  });
}

function classifyLegacyStatus(repoPath, allowlist) {
  return pathMatches(repoPath, allowlist) ? "deprecated" : "blocking";
}

function getTagBlock(lines, startIndex) {
  const block = [];
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 10); index += 1) {
    block.push(lines[index]);
    if (lines[index].includes(">")) break;
  }
  return block.join("\n");
}

function scanText(repoPath, text, options = {}) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const changedLines = options.changedLines;

  const wholeFile = text;
  const denseCandidate = DENSE_SCREEN_PATTERN.test(repoPath);
  const hasVirtualizedList = /\b(?:FlatList|FlashList|VirtualizedList|VirtualList)\b/.test(
    wholeFile
  );
  const hasScrollMap =
    /\bScrollView\b/.test(wholeFile) && /\b(?:data|items|sessions|users|logs|rows)\.map\(/.test(wholeFile);

  if (denseCandidate && hasScrollMap && !hasVirtualizedList) {
    const lineNumber =
      lines.findIndex((line) => /\bScrollView\b|\.map\(/.test(line)) + 1 || 1;
    if (!changedLines || [...changedLines].some((line) => Math.abs(line - lineNumber) <= 80)) {
      addFinding(
        findings,
        "NON_VIRTUALIZED_DENSE_LIST",
        repoPath,
        lineNumber,
        lines[lineNumber - 1] || "dense screen uses ScrollView + map()",
        { status: "deprecated" }
      );
    }
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!shouldCheckLine(lineNumber, changedLines)) return;

    if (
      /from\s+["'][^"']*(?:theme\/(?:modernDesign|unified)|theme\\(?:modernDesign|unified))["']/.test(
        line
      ) ||
      /require\(\s*["'][^"']*(?:theme\/(?:modernDesign|unified)|theme\\(?:modernDesign|unified))["']/.test(
        line
      )
    ) {
      addFinding(findings, "DIRECT_LEGACY_THEME_IMPORT", repoPath, lineNumber, line);
    }

    if (
      /from\s+["'][^"']*(?:theme\/auroraTheme|theme\\auroraTheme)["']/.test(line) ||
      /require\(\s*["'][^"']*(?:theme\/auroraTheme|theme\\auroraTheme)["']/.test(line)
    ) {
      addFinding(findings, "AURORA_THEME_IMPORT", repoPath, lineNumber, line, {
        status: "deprecated",
      });
    }

    if (
      LEGACY_VISUAL_IMPORTS.some((name) =>
        new RegExp(`\\b(?:import|export)\\b[^\\n]*\\b${name}\\b`).test(line)
      )
    ) {
      addFinding(findings, "LEGACY_VISUAL_IMPORT", repoPath, lineNumber, line, {
        status: classifyLegacyStatus(repoPath, APPROVED_LEGACY_FACADE_FILES),
      });
    }

    if (/(^|[^A-Za-z0-9_])#[0-9a-fA-F]{3,8}([^A-Za-z0-9_]|$)/.test(line)) {
      addFinding(findings, "HARDCODED_COLOR", repoPath, lineNumber, line);
    }

    if (
      /\bzIndex\s*:\s*(?:9999|[1-9]\d{3,})\b/.test(line) ||
      /\belevation\s*:\s*[1-9]\d{2,}\b/.test(line)
    ) {
      addFinding(findings, "ARBITRARY_Z_INDEX", repoPath, lineNumber, line);
    }

    if (DECORATIVE_SURFACES.some((name) => line.includes(name))) {
      const allowed = pathMatches(repoPath, APPROVED_DECORATIVE_SURFACES);
      if (!allowed) {
        addFinding(findings, "DECORATIVE_SURFACE", repoPath, lineNumber, line, {
          severity: OPERATIONAL_PATH_PATTERN.test(repoPath) ? "P1" : "P2",
        });
      }
    }

    if (
      /\bbackgroundType\s*=\s*["'](?:aurora|pattern)["']/.test(line) ||
      /\bbackgroundType\s*=\s*\{["'](?:aurora|pattern)["']\}/.test(line) ||
      /\bgradient\s*=\s*\{true\}/.test(line) ||
      /\bwithParticles\s*=\s*\{true\}/.test(line)
    ) {
      const allowed = pathMatches(repoPath, APPROVED_DECORATIVE_SURFACES);
      if (!allowed) {
        addFinding(findings, "DECORATIVE_BACKGROUND_PROP", repoPath, lineNumber, line);
      }
    }

    if (
      /\bvariant\s*=\s*["'](?:glass|gradient)["']/.test(line) ||
      /\bvariant\s*=\s*\{["'](?:glass|gradient)["']\}/.test(line)
    ) {
      addFinding(findings, "GLASS_OR_GRADIENT_VARIANT", repoPath, lineNumber, line, {
        status: classifyLegacyStatus(repoPath, APPROVED_DECORATIVE_SURFACES),
      });
    }

    if (
      /\brouter\.back\(\)/.test(line) &&
      !/safeBackNavigation/.test(line) &&
      !isCommentOnlyLine(line) &&
      !pathMatches(repoPath, APPROVED_ROUTER_BACK_FILES)
    ) {
      addFinding(findings, "UNSAFE_ROUTER_BACK", repoPath, lineNumber, line);
    }

    if (/\bshadow(?:Color|Offset|Opacity|Radius)\s*:/.test(line)) {
      addFinding(findings, "RAW_SHADOW_PROPS", repoPath, lineNumber, line);
    }

    if (
      /\b(?:padding|paddingHorizontal|paddingVertical|margin|marginHorizontal|marginVertical|gap|borderRadius)\s*:\s*(?:[1-9]|[1-9]\d+)\b/.test(
        line
      ) &&
      !/lineHeight|fontSize|top|left|right|bottom/.test(line)
    ) {
      addFinding(findings, "ARBITRARY_SPACING", repoPath, lineNumber, line);
    }

    if (
      /\b(?:withTiming|Animated\.timing)\([^)]*\bduration\s*:\s*(?:[1-9]\d{1,}|[1-9])\b/.test(
        line
      ) ||
      /\bduration\(\s*(?:[1-9]\d{1,}|[1-9])\s*\)/.test(line)
    ) {
      addFinding(findings, "INLINE_ANIMATION_TIMING", repoPath, lineNumber, line);
    }

    if (
      /<(?:Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Button)\b/.test(
        line
      )
    ) {
      const sizeMatches = [
        ...line.matchAll(/\b(?:width|height|minWidth|minHeight)\s*:\s*(\d+)\b/g),
      ];
      for (const match of sizeMatches) {
        const size = Number(match[1]);
        if (Number.isFinite(size) && size > 0 && size < 44) {
          addFinding(findings, "SMALL_TOUCH_TARGET", repoPath, lineNumber, line);
          break;
        }
      }

      const block = getTagBlock(lines, index);
      const allowedTouchableFile = pathMatches(repoPath, APPROVED_DIRECT_TOUCHABLE_FILES);
      const hasA11y =
        /accessibility(?:Role|Label|Hint|State)=/.test(block) || /aria-label=/.test(block);
      const isNonInteractiveWrapper = /TouchableWithoutFeedback/.test(line);
      if (!allowedTouchableFile && !hasA11y && !isNonInteractiveWrapper) {
        addFinding(findings, "TOUCHABLE_MISSING_ACCESSIBILITY", repoPath, lineNumber, line);
      }
    }

    if (/(Something went wrong|Unexpected error|An error occurred|Unknown error)/i.test(line)) {
      addFinding(findings, "GENERIC_ERROR_COPY", repoPath, lineNumber, line);
    }

    if (/\bonMouse(?:Enter|Leave|Over|Out)\s*=/.test(line)) {
      addFinding(findings, "HOVER_ONLY", repoPath, lineNumber, line);
    }
  });

  return findings;
}

function scanFile(repoPath, changedLineMap) {
  const fullPath = path.join(repoRoot, repoPath);
  const text = fs.readFileSync(fullPath, "utf8");
  const changedLines = changedLineMap?.get(repoPath);
  return scanText(repoPath, text, { changedLines });
}

function summarize(findings) {
  const counts = {};
  for (const finding of findings) {
    counts[finding.severity] = (counts[finding.severity] || 0) + 1;
  }

  return ["P0", "P1", "P2", "P3"]
    .filter((severity) => counts[severity])
    .map((severity) => `${severity}: ${counts[severity]}`)
    .join(", ");
}

function countBy(findings, key) {
  const counts = {};
  for (const finding of findings) {
    const value = finding[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(", ") : "none";
}

function printReport(findings) {
  const categoryCounts = countBy(findings, "category");
  const statusCounts = countBy(findings, "status");
  const ruleCounts = countBy(findings, "id");

  console.log("");
  console.log("Governance report");
  console.log(`Migration status: ${formatCounts(statusCounts)}`);
  console.log(`Blocked-pattern report: ${formatCounts(categoryCounts)}`);
  console.log(`Deprecated usage report: ${formatCounts(ruleCounts)}`);

  const reports = [
    ["Token adoption", "token-adoption"],
    ["Accessibility violations", "accessibility"],
    ["Virtualization audit", "virtualization"],
    ["Motion audit", "motion"],
    ["Navigation audit", "navigation"],
  ];

  for (const [label, category] of reports) {
    const matches = findings.filter((finding) => finding.category === category);
    console.log(`${label}: ${matches.length}`);
  }
}

function printFindings(files, findings, maxFindings, report) {
  console.log("UI governance scan");
  console.log(`Files scanned: ${files.length}`);
  console.log(`Findings: ${findings.length}${findings.length ? ` (${summarize(findings)})` : ""}`);

  if (findings.length === 0) {
    console.log("Result: PASS");
    if (report) printReport(findings);
    return;
  }

  console.log("");
  for (const finding of findings.slice(0, maxFindings)) {
    const status = finding.status === "deprecated" ? " [deprecated debt]" : "";
    console.log(`${finding.severity} ${finding.id}${status} ${finding.path}:${finding.lineNumber}`);
    console.log(`  ${finding.title}`);
    console.log(`  ${finding.line}`);
    console.log(`  ${finding.guidance}`);
  }

  if (findings.length > maxFindings) {
    console.log("");
    console.log(`Output truncated: ${findings.length - maxFindings} additional findings hidden.`);
  }

  if (report) printReport(findings);
}

function buildResult(args) {
  const files = getFiles(args.changed);
  const changedLineMap = args.changed ? getChangedLineMap() : undefined;
  const findings = files.flatMap((file) => scanFile(file, changedLineMap)).sort((a, b) => {
    const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (
      (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99) ||
      a.path.localeCompare(b.path) ||
      a.lineNumber - b.lineNumber
    );
  });

  const blockingFindings = findings.filter(
    (finding) =>
      finding.status !== "deprecated" &&
      (finding.severity === "P0" || finding.severity === "P1")
  );

  return { files, findings, blockingFindings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = buildResult(args);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printFindings(result.files, result.findings, args.maxFindings, args.report);
  }

  if (args.strict && result.blockingFindings.length > 0) {
    console.error("");
    console.error(
      `Strict mode failed: ${result.blockingFindings.length} blocking P0/P1 UI governance finding(s).`
    );
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  parseChangedLineMap,
  scanText,
  summarize,
  buildResult,
  RULES,
};
