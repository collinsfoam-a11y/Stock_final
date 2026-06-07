/**
 * Minimal JWT utilities for client-side token inspection.
 *
 * These helpers decode and validate JWTs without performing cryptographic signature
 * verification — they are suitable for UX decisions such as proactive logout before
 * sending an expired token to the server, but MUST NOT be used to make security-
 * sensitive trust decisions (the server validates the signature on every request).
 *
 * NOTE: For production use, consider replacing this with the 'jose' library
 * (https://github.com/panva/jose), which provides full JWA/JWE/JWK support,
 * proper error types, and is actively maintained.
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP: number[] = (() => {
  const table = new Array<number>(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

const normalizeBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  return padding === 0 ? base64 : base64 + "=".repeat(4 - padding);
};

const decodeBase64 = (value: string): string => {
  const atobFn = (globalThis as any).atob as ((input: string) => string) | undefined;
  if (typeof atobFn === "function") {
    return atobFn(value);
  }

  const BufferCtor = (globalThis as any).Buffer as
    | { from: (input: string, encoding: "base64") => { toString: (enc: "utf8") => string } }
    | undefined;
  if (BufferCtor && typeof BufferCtor.from === "function") {
    return BufferCtor.from(value, "base64").toString("utf8");
  }

  // Minimal base64 decoder polyfill (sufficient for JWT JSON payloads).
  const cleaned = value.replace(/[^A-Za-z0-9+/=]/g, "");
  let output = "";

  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = cleaned.charCodeAt(i);
    const c2 = cleaned.charCodeAt(i + 1);
    const c3 = cleaned.charAt(i + 2);
    const c4 = cleaned.charAt(i + 3);

    const e1 = BASE64_LOOKUP[c1] ?? -1;
    const e2 = BASE64_LOOKUP[c2] ?? -1;
    const e3 = c3 === "=" ? 64 : (BASE64_LOOKUP[c3.charCodeAt(0)] ?? -1);
    const e4 = c4 === "=" ? 64 : (BASE64_LOOKUP[c4.charCodeAt(0)] ?? -1);

    if (e1 < 0 || e2 < 0 || e3 < 0 || e4 < 0) {
      throw new Error("Invalid base64 payload");
    }

    const triple = (e1 << 18) | (e2 << 12) | ((e3 & 63) << 6) | (e4 & 63);
    output += String.fromCharCode((triple >> 16) & 255);
    if (c3 !== "=") output += String.fromCharCode((triple >> 8) & 255);
    if (c4 !== "=") output += String.fromCharCode(triple & 255);
  }

  return output;
};

export interface JwtPayload {
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: unknown;
}

/**
 * Decode the payload of a JWT without verifying its signature.
 * Returns `null` if the token is malformed.
 */
export const decodeJwt = (token: string): JwtPayload | null => {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const payloadJson = decodeBase64(normalizeBase64Url(parts[1]));
    return JSON.parse(payloadJson) as JwtPayload;
  } catch {
    return null;
  }
};

/**
 * Returns the decoded payload of a JWT, or `null` if it cannot be parsed.
 * Alias for `decodeJwt` with a more explicit name for call sites that only
 * need the payload fields.
 */
export const getTokenPayload = decodeJwt;

/**
 * Returns `true` if the token is expired or cannot be decoded.
 * Treats a missing or non-numeric `exp` claim as expired so that broken
 * tokens do not keep an auth session alive and trigger refresh/401 loops.
 */
export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = decodeJwt(token);
    if (!payload || typeof payload.exp !== "number") return true;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now;
  } catch {
    return true;
  }
};
