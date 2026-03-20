/**
 * Tests for UUID and ID generation utilities.
 */

import { describe, it, expect } from "@jest/globals";
import { generateUUID, generateShortId, generateOfflineId } from "../uuid";

describe("generateUUID", () => {
  it("generates a string", () => {
    expect(typeof generateUUID()).toBe("string");
  });

  it("generates UUID in correct format", () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique UUIDs", () => {
    const uuids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(uuids.size).toBe(100);
  });

  it("generates version 4 UUID", () => {
    const uuid = generateUUID();
    const parts = uuid.split("-");
    // Version is the first character of the 3rd group
    expect(parts[2]![0]).toBe("4");
  });

  it("generates valid variant bits", () => {
    const uuid = generateUUID();
    const parts = uuid.split("-");
    const variantChar = parts[3]![0]!.toLowerCase();
    // RFC4122 variant: the first hex digit of the 4th group is 8, 9, a, or b
    expect(["8", "9", "a", "b"]).toContain(variantChar);
  });
});

describe("generateShortId", () => {
  it("generates a string of length 8", () => {
    expect(generateShortId().length).toBe(8);
  });

  it("contains only hex characters", () => {
    const id = generateShortId();
    expect(id).toMatch(/^[0-9a-f]{8}$/i);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateShortId()));
    expect(ids.size).toBe(50);
  });

  it("does not contain hyphens", () => {
    const id = generateShortId();
    expect(id).not.toContain("-");
  });
});

describe("generateOfflineId", () => {
  it("starts with offline_ prefix", () => {
    const id = generateOfflineId();
    expect(id.startsWith("offline_")).toBe(true);
  });

  it("contains a UUID after the prefix", () => {
    const id = generateOfflineId();
    const uuid = id.replace("offline_", "");
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateOfflineId()));
    expect(ids.size).toBe(50);
  });
});
