/**
 * Route hygiene guard.
 *
 * expo-router turns every file under `app/` into a navigable route. Two classes
 * of mistake silently create phantom/duplicate routes:
 *
 *  1. Implementation files with a non-platform second extension (e.g.
 *     `users.screen.tsx`). `screen` is not a valid platform, so expo-router does
 *     NOT strip it — it registers `/admin/users.screen` alongside `/admin/users`.
 *  2. Plain component files colocated under `app/` (e.g.
 *     `app/staff/components/SectionLists.tsx`) become routes too.
 *
 * Both were cleaned up; this test fails if either pattern reappears. Put screen
 * implementations directly in the route file, and components under `src/`.
 */

import fs from "fs";
import path from "path";

const APP_DIR = path.resolve(__dirname, "..");

const ROUTE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);
const VALID_PLATFORM_EXTENSIONS = new Set(["android", "ios", "native", "web"]);

/** Directory names that legitimately hold non-route files inside `app/`. */
const NON_ROUTE_DIR_NAMES = new Set(["__tests__", "__mocks__"]);

/** Walk `app/`, returning every file path relative to `app/`. */
function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(abs);
    }
    return [path.relative(APP_DIR, abs)];
  });
}

const allFiles = walk(APP_DIR);

function isInNonRouteDir(relPath: string): boolean {
  return relPath
    .split(path.sep)
    .some((segment) => NON_ROUTE_DIR_NAMES.has(segment));
}

describe("app/ route hygiene", () => {
  it("has no '*.screen.*' implementation files (they register phantom routes)", () => {
    const offenders = allFiles.filter((rel) => {
      const base = path.basename(rel);
      return /\.screen\.(tsx?|jsx?)$/.test(base);
    });

    expect(offenders).toEqual([]);
  });

  it("has no files with an invalid (non-platform) second extension", () => {
    const offenders = allFiles.filter((rel) => {
      if (isInNonRouteDir(rel)) {
        return false;
      }
      const base = path.basename(rel);
      const ext = path.extname(base);
      if (!ROUTE_EXTENSIONS.has(ext)) {
        return false;
      }
      const parts = base.slice(0, -ext.length).split(".");
      // e.g. "users.screen" -> ["users", "screen"]; "+not-found" stays one part.
      if (parts.length < 2) {
        return false;
      }
      const secondExt = parts[parts.length - 1] ?? "";
      return !VALID_PLATFORM_EXTENSIONS.has(secondExt);
    });

    expect(offenders).toEqual([]);
  });

  it("has no colocated 'components' directories under app/", () => {
    const offenders = allFiles.filter((rel) =>
      rel.split(path.sep).includes("components")
    );

    expect(offenders).toEqual([]);
  });
});
