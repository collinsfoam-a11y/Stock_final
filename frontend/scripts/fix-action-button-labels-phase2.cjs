/**
 * Phase 2 cleanup: fixes remaining `accessibilityLabel="Action button"` cases
 * that the perl regex and phase-1 codemod missed.
 *
 * Handles three patterns:
 * 1. OVERRIDE (spread present in same tag) → remove the override line,
 *    merge `>` onto the previous line.
 * 2. TEXT CHILD → remove the label (RN reads <Text> content).
 * 3. ICON-ONLY → replace with a meaningful label inferred from Ionicons name.
 *
 * Usage: node scripts/fix-action-button-labels-phase2.cjs
 */
const fs = require("fs");
const path = require("path");

const FRONTEND_ROOT = path.resolve(__dirname, "..");

const ICON_LABELS = {
  close: "Close", "close-circle": "Clear", "close-outline": "Close",
  "arrow-back": "Go back", "chevron-back": "Previous", "chevron-forward": "Next",
  refresh: "Refresh", "refresh-outline": "Refresh",
  "settings-outline": "Settings", settings: "Settings",
  "add-circle-outline": "Add", "add-circle": "Add", add: "Add",
  scan: "Scan", "scan-outline": "Scan",
  "trash-outline": "Delete", trash: "Delete",
  "log-out-outline": "Log out", "log-out": "Log out",
  "home-outline": "Home", home: "Home",
  checkmark: "Confirm", "checkmark-circle": "Confirm",
  "create-outline": "Edit", create: "Edit", pencil: "Edit", "pencil-outline": "Edit",
  options: "Options", "options-outline": "Options",
  menu: "Open menu", "menu-outline": "Open menu",
  filter: "Filter", "filter-outline": "Filter", "funnel-outline": "Filter",
  search: "Search", "search-outline": "Search",
  "eye-off": "Hide", eye: "Show",
  play: "Start", "play-outline": "Start", "play-circle": "Start",
  pause: "Pause", "pause-outline": "Pause",
  download: "Download", "download-outline": "Download",
  upload: "Upload", "upload-outline": "Upload",
  share: "Share", "share-outline": "Share",
  "information-circle": "Information", "information-circle-outline": "Information",
  "help-circle": "Help", "help-circle-outline": "Help",
  "alert-circle": "Alert", "alert-circle-outline": "Alert",
  warning: "Warning", "warning-outline": "Warning",
  "ellipsis-horizontal": "More options", "ellipsis-vertical": "More options",
  "caret-down": "Dropdown", "caret-up": "Sort",
  swap: "Swap", sync: "Sync", "sync-outline": "Sync",
  "cloud-offline": "Offline", "cloud-offline-outline": "Offline",
  wifi: "Online", "wifi-outline": "Online",
  notifications: "Notifications", "notifications-outline": "Notifications",
  person: "Profile", "person-outline": "Profile",
  people: "People", "people-outline": "People",
  time: "Time", "time-outline": "Time",
  calendar: "Calendar", "calendar-outline": "Calendar",
  location: "Location", "location-outline": "Location",
  camera: "Camera", "camera-outline": "Camera",
  image: "Image", "image-outline": "Image",
  mail: "Email", "mail-outline": "Email",
  "lock-closed": "Locked", "lock-closed-outline": "Locked",
  "lock-open": "Unlocked", "lock-open-outline": "Unlocked",
  star: "Star", "star-outline": "Star",
  heart: "Favorite", "heart-outline": "Favorite",
  bookmark: "Bookmark", "bookmark-outline": "Bookmark",
  cube: "Item", "cube-outline": "Item",
  grid: "Grid", "grid-outline": "Grid",
  list: "List", "list-outline": "List",
  save: "Save", "save-outline": "Save",
  repeat: "Repeat", "repeat-outline": "Repeat",
  "arrow-undo": "Undo", "arrow-undo-outline": "Undo",
  "arrow-redo": "Redo", "arrow-redo-outline": "Redo",
  "arrow-forward": "Forward", "arrow-up": "Up", "arrow-down": "Down",
  "chevron-up": "Up", "chevron-down": "Down",
  "chevron-up-outline": "Up", "chevron-down-outline": "Down",
  "chevron-back-outline": "Previous", "chevron-forward-outline": "Next",
  "remove-circle": "Remove", "remove-circle-outline": "Remove",
  remove: "Remove", subtract: "Subtract", "subtract-circle": "Subtract",
  business: "Business", "business-outline": "Business",
  storefront: "Store", "storefront-outline": "Store",
  barchart: "Chart", "barchart-outline": "Chart",
  "pie-chart": "Chart", "pie-chart-outline": "Chart",
  "stats-chart": "Statistics", "stats-chart-outline": "Statistics",
  "trending-up": "Trending up", "trending-down": "Trending down",
  "checkmark-circle-outline": "Confirm", "close-circle-outline": "Close",
  "checkmark-done": "Confirm", "add-sharp": "Add",
  "remove-circle-sharp": "Remove", "key": "Key", "key-outline": "Key",
  pin: "Location", map: "Map", "map-outline": "Map",
  call: "Call", "call-outline": "Call",
  "person-add": "Add person", "person-add-outline": "Add person",
  photograph: "Photo", images: "Images", "images-outline": "Images",
  folder: "Folder", "folder-outline": "Folder",
  document: "Document", "document-outline": "Document",
  clipboard: "Clipboard", "clipboard-outline": "Clipboard",
  pricetag: "Tag", "pricetag-outline": "Tag",
  "pricetags": "Tags", "pricetags-outline": "Tags",
  albums: "List", "albums-outline": "List",
  "git-branch": "Branch", "git-branch-outline": "Branch",
  stop: "Stop", "stop-circle": "Stop", "stop-outline": "Stop",
};

function findTsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".expo") continue;
      results.push(...findTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Given the line index of `accessibilityLabel="Action button"`,
 * scan backwards to find the start of the current JSX opening tag
 * and check if it contains a getAccessibleButtonProps/getAccessibleToggleProps spread.
 */
function hasSpreadInTag(lines, idx) {
  for (let i = idx - 1; i >= 0; i--) {
    const line = lines[i];
    // Found the start of the opening element
    if (/<[A-Z]/.test(line) || /<[a-z]/.test(line)) {
      // Check from this line down to idx for spread with getAccessible
      const tagBlock = lines.slice(i, idx + 1).join("\n");
      return /getAccessible(Button|Toggle)Props/.test(tagBlock);
    }
  }
  return false;
}

/**
 * Look ahead from the attribute line for <Text> or <Ionicons name="...">
 */
function findChildInfo(lines, idx) {
  for (let j = idx + 1; j < Math.min(idx + 10, lines.length); j++) {
    const ahead = lines[j];
    if (/<\/(AppTouchable|Pressable|TouchableOpacity|View|Text|Ionicons)/.test(ahead)) break;
    if (/<Text[\s>]/.test(ahead)) return { type: "text" };
    const iconMatch = ahead.match(/<Ionicons[^>]*\bname=["']([^"']+)["']/);
    if (iconMatch) return { type: "icon", name: iconMatch[1] };
  }
  // Also check the attribute line itself
  const line = lines[idx];
  if (/<Text[\s>]/.test(line)) return { type: "text" };
  const inlineIcon = line.match(/<Ionicons[^>]*\bname=["']([^"']+)["']/);
  if (inlineIcon) return { type: "icon", name: inlineIcon[1] };
  return { type: "unknown" };
}

function processFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes('accessibilityLabel="Action button"')) {
    return { changed: false };
  }

  const lines = source.split("\n");
  const changes = []; // { idx, action, label? }
  let unhandled = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('accessibilityLabel="Action button"')) continue;

    // Case 1: Override — spread present in same tag
    if (hasSpreadInTag(lines, i)) {
      changes.push({ idx: i, action: "remove-override" });
      continue;
    }

    // Case 2 & 3: Check children
    const child = findChildInfo(lines, i);
    if (child.type === "text") {
      changes.push({ idx: i, action: "remove" });
    } else if (child.type === "icon" && ICON_LABELS[child.name]) {
      changes.push({ idx: i, action: "replace", label: ICON_LABELS[child.name] });
    } else {
      unhandled++;
    }
  }

  if (changes.length === 0) {
    return { changed: false, unhandled };
  }

  // Apply changes in reverse order
  let changeCount = 0;
  for (let k = changes.length - 1; k >= 0; k--) {
    const change = changes[k];
    const line = lines[change.idx];

    if (change.action === "remove-override" || change.action === "remove") {
      // Remove `accessibilityLabel="Action button"` from the line.
      // If the line is ONLY this attribute + `>`, merge `>` onto previous line.
      const stripped = line.replace(/^\s+/, "");
      if (stripped === 'accessibilityLabel="Action button">' || stripped === 'accessibilityLabel="Action button" />') {
        // Entire line is just the attribute — merge `>` or ` />` onto prev line
        const suffix = stripped.endsWith("/>") ? " />" : ">";
        const prevIdx = change.idx - 1;
        // Find the previous non-empty line
        while (prevIdx >= 0 && lines[prevIdx].trim() === "") prevIdx--;
        if (prevIdx >= 0) {
          lines[prevIdx] = lines[prevIdx] + suffix;
          lines.splice(change.idx, 1);
        } else {
          // Fallback: just replace inline
          lines[change.idx] = line.replace('accessibilityLabel="Action button"', "").replace(/^\s+>/, ">");
        }
      } else {
        // Attribute is not the only thing on the line — just remove it
        lines[change.idx] = line
          .replace(/\s*accessibilityLabel="Action button"/, "");
      }
      changeCount++;
    } else if (change.action === "replace") {
      lines[change.idx] = line.replace(
        /accessibilityLabel="Action button"/,
        `accessibilityLabel="${change.label}"`
      );
      changeCount++;
    }
  }

  const modified = lines.join("\n");
  if (modified === source) {
    return { changed: false, unhandled };
  }

  fs.writeFileSync(filePath, modified, "utf8");
  return { changed: true, changeCount, unhandled };
}

// Main
const files = [
  ...findTsxFiles(path.join(FRONTEND_ROOT, "src")),
  ...findTsxFiles(path.join(FRONTEND_ROOT, "app")),
];

let totalChanged = 0;
let totalUnhandled = 0;
const unhandledFiles = [];

for (const file of files) {
  const result = processFile(file);
  if (result.changed || result.unhandled) {
    const rel = path.relative(FRONTEND_ROOT, file);
    if (result.changeCount) {
      console.log(`  ${rel}: ${result.changeCount} fixed`);
    }
    if (result.unhandled) {
      console.log(`  ${rel}: ${result.unhandled} still unhandled`);
      unhandledFiles.push(rel);
    }
    totalChanged += result.changeCount || 0;
    totalUnhandled += result.unhandled || 0;
  }
}

console.log(`\nTotal: ${totalChanged} labels fixed, ${totalUnhandled} still need manual review`);
