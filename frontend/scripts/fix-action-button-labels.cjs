/**
 * Cleanup codemod: fixes the `accessibilityLabel="Action button"` regression
 * introduced by codemod-touchable.cjs.
 *
 * Strategy:
 * 1. If the element has a <Text> child  → remove the generic label entirely
 *    (React Native reads the text content as the accessibility label).
 * 2. If the element wraps an <Ionicons name="X" /> → replace "Action button"
 *    with a human-readable label inferred from the icon name.
 * 3. Otherwise → leave unchanged (needs manual review).
 *
 * Usage:
 *   node scripts/fix-action-button-labels.cjs
 */
const fs = require("fs");
const path = require("path");

const FRONTEND_SRC = path.resolve(__dirname, "..", "src");
const FRONTEND_APP = path.resolve(__dirname, "..", "app");

// Icon name → human label mapping (Ionicons)
const ICON_LABELS = {
  close: "Close",
  "close-circle": "Clear",
  "close-outline": "Close",
  "arrow-back": "Go back",
  "chevron-back": "Previous",
  "chevron-back-outline": "Previous",
  "chevron-forward": "Next",
  "chevron-forward-outline": "Next",
  refresh: "Refresh",
  "refresh-outline": "Refresh",
  "refresh-circle": "Refresh",
  "settings-outline": "Settings",
  "settings": "Settings",
  "add-circle-outline": "Add",
  "add-circle": "Add",
  "add-outline": "Add",
  add: "Add",
  scan: "Scan",
  "scan-outline": "Scan",
  "trash-outline": "Delete",
  trash: "Delete",
  "log-out-outline": "Log out",
  "log-out": "Log out",
  "home-outline": "Home",
  home: "Home",
  checkmark: "Confirm",
  "checkmark-circle": "Confirm",
  "checkmark-done": "Confirm",
  "create-outline": "Edit",
  create: "Edit",
  options: "Options",
  "options-outline": "Options",
  menu: "Open menu",
  "menu-outline": "Open menu",
  filter: "Filter",
  "filter-outline": "Filter",
  "funnel-outline": "Filter",
  search: "Search",
  "search-outline": "Search",
  "eye-off": "Hide",
  eye: "Show",
  "eye-off-outline": "Hide",
  "eye-outline": "Show",
  "play": "Start",
  "play-outline": "Start",
  "play-circle": "Start",
  "pause": "Pause",
  "pause-outline": "Pause",
  "pause-circle": "Pause",
  "stop": "Stop",
  "stop-circle": "Stop",
  "stop-outline": "Stop",
  download: "Download",
  "download-outline": "Download",
  "cloud-download": "Download",
  "cloud-download-outline": "Download",
  upload: "Upload",
  "upload-outline": "Upload",
  "cloud-upload": "Upload",
  "cloud-upload-outline": "Upload",
  share: "Share",
  "share-outline": "Share",
  "information-circle": "Information",
  "information-circle-outline": "Information",
  "help-circle": "Help",
  "help-circle-outline": "Help",
  "help-buoy": "Help",
  "alert-circle": "Alert",
  "alert-circle-outline": "Alert",
  "warning": "Warning",
  "warning-outline": "Warning",
  "checkmark-circle-outline": "Confirm",
  "close-circle-outline": "Close",
  "ellipsis-horizontal": "More options",
  "ellipsis-vertical": "More options",
  "ellipsis-horizontal-circle": "More options",
  "caret-down": "Dropdown",
  "caret-down-outline": "Dropdown",
  "caret-up": "Sort",
  "caret-up-outline": "Sort",
  "caret-forward": "Next",
  "caret-back": "Previous",
  "swap-horizontal": "Swap",
  "swap-vertical": "Swap",
  "sync": "Sync",
  "sync-outline": "Sync",
  "sync-circle": "Sync",
  "cloud-offline": "Offline",
  "cloud-offline-outline": "Offline",
  "wifi": "Online",
  "wifi-outline": "Online",
  "cloud": "Cloud",
  "cloud-outline": "Cloud",
  "notifications": "Notifications",
  "notifications-outline": "Notifications",
  "person": "Profile",
  "person-outline": "Profile",
  "person-circle": "Profile",
  "person-circle-outline": "Profile",
  "people": "People",
  "people-outline": "People",
  "person-add": "Add person",
  "person-add-outline": "Add person",
  "time": "Time",
  "time-outline": "Time",
  "calendar": "Calendar",
  "calendar-outline": "Calendar",
  "location": "Location",
  "location-outline": "Location",
  "pin": "Location",
  "map": "Map",
  "map-outline": "Map",
  "camera": "Camera",
  "camera-outline": "Camera",
  "image": "Image",
  "image-outline": "Image",
  "images": "Images",
  "images-outline": "Images",
  "photograph": "Photo",
  "mail": "Email",
  "mail-outline": "Email",
  "call": "Call",
  "call-outline": "Call",
  "lock-closed": "Locked",
  "lock-closed-outline": "Locked",
  "lock-open": "Unlocked",
  "lock-open-outline": "Unlocked",
  "key": "Key",
  "key-outline": "Key",
  "star": "Star",
  "star-outline": "Star",
  "heart": "Favorite",
  "heart-outline": "Favorite",
  "bookmark": "Bookmark",
  "bookmark-outline": "Bookmark",
  "pricetag": "Tag",
  "pricetag-outline": "Tag",
  "pricetags": "Tags",
  "pricetags-outline": "Tags",
  "cube": "Item",
  "cube-outline": "Item",
  "grid": "Grid",
  "grid-outline": "Grid",
  "list": "List",
  "list-outline": "List",
  "albums": "List",
  "albums-outline": "List",
  "folder": "Folder",
  "folder-outline": "Folder",
  "document": "Document",
  "document-outline": "Document",
  "clipboard": "Clipboard",
  "clipboard-outline": "Clipboard",
  "save": "Save",
  "save-outline": "Save",
  "pencil": "Edit",
  "pencil-outline": "Edit",
  "repeat": "Repeat",
  "repeat-outline": "Repeat",
  "arrow-undo": "Undo",
  "arrow-undo-outline": "Undo",
  "arrow-redo": "Redo",
  "arrow-redo-outline": "Redo",
  "arrow-forward": "Forward",
  "arrow-up": "Up",
  "arrow-down": "Down",
  "chevron-up": "Up",
  "chevron-up-outline": "Up",
  "chevron-down": "Down",
  "chevron-down-outline": "Down",
  "remove-circle": "Remove",
  "remove-circle-outline": "Remove",
  "remove": "Remove",
  "subtract": "Subtract",
  "subtract-circle": "Subtract",
  "add-sharp": "Add",
  "business": "Business",
  "business-outline": "Business",
  "storefront": "Store",
  "storefront-outline": "Store",
  "barchart": "Chart",
  "barchart-outline": "Chart",
  "pie-chart": "Chart",
  "pie-chart-outline": "Chart",
  "stats-chart": "Statistics",
  "stats-chart-outline": "Statistics",
  "trending-up": "Trending up",
  "trending-down": "Trending down",
  "git-branch": "Branch",
  "git-branch-outline": "Branch",
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

function processFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes('accessibilityLabel="Action button"')) {
    return { changed: false };
  }

  let modified = source;
  let changeCount = 0;
  let unhandledCount = 0;

  // Pattern: match the attribute in context.
  // We need to find `accessibilityLabel="Action button"` and look at
  // surrounding context to decide what to do.

  // Strategy: split into lines, find lines with the attribute,
  // and look at the following lines for <Text> or <Ionicons name="...">

  const lines = modified.split("\n");
  const changes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('accessibilityLabel="Action button"')) continue;

    // Look ahead (up to 5 lines) for children
    let hasTextChild = false;
    let iconName = null;

    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const ahead = lines[j];
      // Stop if we hit a closing tag or another opening element at same/lower depth
      if (ahead.includes("</AppTouchable") || ahead.includes("</Pressable") ||
          ahead.includes("</TouchableOpacity") || ahead.includes("</View")) {
        // Check if this line itself has Text before the close
        break;
      }
      if (ahead.includes("<Text")) {
        hasTextChild = true;
        break;
      }
      // Look for Ionicons name="..."
      const iconMatch = ahead.match(/name=["']([^"']+)["']/);
      if (ahead.includes("Ionicons") && iconMatch) {
        iconName = iconMatch[1];
        break;
      }
      // Also check current line for inline content
    }

    // Also check if the same line has <Text> or Ionicons (inline)
    if (line.includes("<Text")) hasTextChild = true;
    const inlineIcon = line.match(/<Ionicons[^>]*name=["']([^"']+)["']/);
    if (inlineIcon) iconName = inlineIcon[1];

    if (hasTextChild) {
      // Remove the attribute; RN will read the <Text> content as the label.
      // The attribute might be `accessibilityLabel="Action button">` (last prop)
      // or `accessibilityLabel="Action button"` (not last prop)
      changes.push({ line: i, action: "remove" });
    } else if (iconName && ICON_LABELS[iconName]) {
      // Replace with a meaningful label
      changes.push({ line: i, action: "replace", label: ICON_LABELS[iconName] });
    } else {
      unhandledCount++;
    }
  }

  // Apply changes in reverse order to preserve line indices
  for (let k = changes.length - 1; k >= 0; k--) {
    const change = changes[k];
    const line = lines[change.line];

    if (change.action === "remove") {
      // Remove `accessibilityLabel="Action button"` from the line
      // If it ends with `>`, we need to keep the `>`
      if (line.match(/accessibilityLabel="Action button"\s*>/)) {
        lines[change.line] = line.replace(/\s*accessibilityLabel="Action button"\s*>/, " >");
      } else {
        lines[change.line] = line.replace(/\s*accessibilityLabel="Action button"/, "");
      }
      changeCount++;
    } else if (change.action === "replace") {
      lines[change.line] = line.replace(
        /accessibilityLabel="Action button"/,
        `accessibilityLabel="${change.label}"`
      );
      changeCount++;
    }
  }

  if (changeCount === 0 && unhandledCount === 0) {
    return { changed: false };
  }

  modified = lines.join("\n");
  fs.writeFileSync(filePath, modified, "utf8");
  return { changed: true, changeCount, unhandledCount };
}

// Main
const files = [...findTsxFiles(FRONTEND_SRC), ...findTsxFiles(FRONTEND_APP)];
let totalChanged = 0;
let totalUnhandled = 0;
const unhandledFiles = [];

for (const file of files) {
  const result = processFile(file);
  if (result.changed) {
    const rel = path.relative(path.resolve(__dirname, ".."), file);
    console.log(`  ${rel}: ${result.changeCount} fixed${result.unhandledCount ? `, ${result.unhandledCount} unhandled` : ""}`);
    totalChanged += result.changeCount;
    totalUnhandled += result.unhandledCount;
    if (result.unhandledCount) unhandledFiles.push(rel);
  }
}

console.log(`\nTotal: ${totalChanged} labels fixed, ${totalUnhandled} need manual review`);
if (unhandledFiles.length) {
  console.log("\nFiles with unhandled (icon-only, unknown icon) cases:");
  for (const f of unhandledFiles) console.log(`  ${f}`);
}
