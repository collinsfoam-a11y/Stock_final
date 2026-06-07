/**
 * Tests for src/utils/jwt.ts
 *
 * These helpers operate on unsigned JWTs — they decode and inspect payloads
 * without verifying signatures, which is intentional for client-side UX use.
 */

import { decodeJwt, getTokenPayload, isTokenExpired } from "./jwt";

// ---------------------------------------------------------------------------
// Helpers to build test tokens with a known payload
// ---------------------------------------------------------------------------

/**
 * Encode an object as a base64url string (no padding).
 * Works in Node.js (Buffer) and in jsdom (btoa after TextEncoder).
 */
function toBase64Url(obj: object): string {
  const json = JSON.stringify(obj);
  let base64: string;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(json, "utf8").toString("base64");
  } else {
    // jsdom / browser environment
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Build a syntactically valid but cryptographically unsigned JWT. */
function buildToken(payload: object): string {
  const header = toBase64Url({ alg: "HS256", typ: "JWT" });
  const body = toBase64Url(payload);
  return `${header}.${body}.fakesignature`;
}

// ---------------------------------------------------------------------------
// Fixed timestamps
// ---------------------------------------------------------------------------

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

// ---------------------------------------------------------------------------
// decodeJwt
// ---------------------------------------------------------------------------

describe("decodeJwt", () => {
  it("decodes a valid token and returns the correct payload", () => {
    const payload = { sub: "user-42", username: "alice", exp: FUTURE_EXP, iat: FUTURE_EXP - 900 };
    const token = buildToken(payload);

    const result = decodeJwt(token);

    expect(result).not.toBeNull();
    expect(result?.sub).toBe("user-42");
    expect(result?.username).toBe("alice");
    expect(result?.exp).toBe(FUTURE_EXP);
  });

  it("decodes an expired token (still returns the payload — expiry check is separate)", () => {
    const payload = { sub: "user-1", exp: PAST_EXP };
    const token = buildToken(payload);

    const result = decodeJwt(token);

    expect(result).not.toBeNull();
    expect(result?.exp).toBe(PAST_EXP);
  });

  it("returns null for a malformed token with wrong part count", () => {
    expect(decodeJwt("not.a.valid.jwt.with.too.many.parts")).toBeNull();
    expect(decodeJwt("onlyone")).toBeNull();
    expect(decodeJwt("two.parts")).toBeNull();
  });

  it("returns null for a token whose payload is not valid JSON", () => {
    // Build a token whose middle segment decodes to invalid JSON
    const badPayload = "!!!notBase64!!!";
    const token = `eyJhbGciOiJIUzI1NiJ9.${badPayload}.sig`;
    expect(decodeJwt(token)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeJwt("")).toBeNull();
  });

  it("decodes a token with an empty payload segment as null (empty string → not parseable as JWT)", () => {
    // middle part is empty — parts[1] is ''
    expect(decodeJwt("header..sig")).toBeNull();
  });

  it("preserves extra claims beyond the standard ones", () => {
    const payload = { sub: "u1", exp: FUTURE_EXP, role: "admin", permissions: ["read", "write"] };
    const result = decodeJwt(buildToken(payload));

    expect(result?.role).toBe("admin");
    expect(result?.permissions).toEqual(["read", "write"]);
  });
});

// ---------------------------------------------------------------------------
// isTokenExpired
// ---------------------------------------------------------------------------

describe("isTokenExpired", () => {
  it("returns false for a token with a future exp", () => {
    const token = buildToken({ sub: "u1", exp: FUTURE_EXP });
    expect(isTokenExpired(token)).toBe(false);
  });

  it("returns true for a token with a past exp", () => {
    const token = buildToken({ sub: "u1", exp: PAST_EXP });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns true when the exp claim is missing", () => {
    const token = buildToken({ sub: "u1" }); // no exp
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns true when the exp claim is not a number", () => {
    const token = buildToken({ sub: "u1", exp: "not-a-number" });
    expect(isTokenExpired(token)).toBe(true);
  });

  it("returns true for a malformed / undecodable token", () => {
    expect(isTokenExpired("garbage")).toBe(true);
  });

  it("returns true when exp equals exactly the current second (boundary: already expired)", () => {
    // exp <= now → expired per implementation
    const now = Math.floor(Date.now() / 1000);
    const token = buildToken({ exp: now });
    expect(isTokenExpired(token)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTokenPayload (alias for decodeJwt)
// ---------------------------------------------------------------------------

describe("getTokenPayload", () => {
  it("returns the same result as decodeJwt for a valid token", () => {
    const payload = { sub: "u99", exp: FUTURE_EXP, role: "staff" };
    const token = buildToken(payload);

    expect(getTokenPayload(token)).toEqual(decodeJwt(token));
  });

  it("returns null for an invalid token", () => {
    expect(getTokenPayload("bad")).toBeNull();
  });

  it("returns the correct sub, exp, and iat fields", () => {
    const iat = FUTURE_EXP - 300;
    const token = buildToken({ sub: "service-account", exp: FUTURE_EXP, iat });

    const result = getTokenPayload(token);
    expect(result?.sub).toBe("service-account");
    expect(result?.exp).toBe(FUTURE_EXP);
    expect(result?.iat).toBe(iat);
  });
});
