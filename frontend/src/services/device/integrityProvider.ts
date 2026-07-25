/**
 * Stock Verify v2.6.2 — IntegrityProvider
 *
 * Pluggable platform attestation abstraction.
 *
 * Architecture:
 *   IntegrityProvider  (interface)
 *     ├─ IOSAppAttestProvider     (App Attest — challenge/response)
 *     ├─ AndroidPlayIntegrityProvider  (Play Integrity API)
 *     └─ MockIntegrityProvider    (returns null — used in dev / Expo Go)
 *
 * The networking layer asks:
 *   const token = await integrityProvider.getToken(requestHash);
 *
 * If the provider returns null the header is simply omitted,
 * and the server falls back to existing auth.
 */

import { Platform } from "react-native";
import { createLogger } from "../logging";

const log = createLogger("integrityProvider");

// ─── Interface ────────────────────────────────────────────────────

export interface IntegrityToken {
  /** Platform-specific attestation/integrity token string. */
  token: string;
  /** Header name the networking layer should use. */
  headerName: string;
}

export interface IntegrityProvider {
  /**
   * Returns an attestation token for the given request hash,
   * or null if attestation is unavailable on this platform/build.
   */
  getToken(requestHash: string): Promise<IntegrityToken | null>;
}

// ─── iOS App Attest ───────────────────────────────────────────────

export class IOSAppAttestProvider implements IntegrityProvider {
  /**
   * Apple recommends a challenge/response flow:
   *   1. Server issues a one-time challenge.
   *   2. App creates an assertion using DeviceCheck / App Attest.
   *   3. Server verifies.
   *
   * Full implementation requires a native module bridge (e.g. react-native-app-attest).
   * The interface is ready; the native call will be wired when
   * the project ejects from Expo Go to a custom dev client.
   */
  public async getToken(requestHash: string): Promise<IntegrityToken | null> {
    try {
      // Placeholder for native bridge call:
      // const assertion = await NativeModules.AppAttest.generateAssertion(requestHash);
      log.info("iOS App Attest: native bridge not yet connected");
      return null;
    } catch (e) {
      log.warn("iOS App Attest unavailable", e);
      return null;
    }
  }
}

// ─── Android Play Integrity ───────────────────────────────────────

export class AndroidPlayIntegrityProvider implements IntegrityProvider {
  /**
   * Google recommends obtaining a Play Integrity token for
   * sensitive requests and verifying on the backend.
   *
   * Full implementation requires the Play Integrity native SDK.
   * The interface is ready; the native call will be wired when
   * the project ejects to a custom dev client.
   */
  public async getToken(requestHash: string): Promise<IntegrityToken | null> {
    try {
      // Placeholder for native bridge call:
      // const token = await NativeModules.PlayIntegrity.requestIntegrityToken(requestHash);
      log.info("Android Play Integrity: native bridge not yet connected");
      return null;
    } catch (e) {
      log.warn("Android Play Integrity unavailable", e);
      return null;
    }
  }
}

// ─── Mock (development / Expo Go) ─────────────────────────────────

export class MockIntegrityProvider implements IntegrityProvider {
  public async getToken(_requestHash: string): Promise<IntegrityToken | null> {
    return null; // No attestation in development
  }
}

// ─── Factory ──────────────────────────────────────────────────────

/**
 * Returns the correct IntegrityProvider for the current platform.
 * Falls back to MockIntegrityProvider if the platform cannot be determined.
 */
export function createIntegrityProvider(): IntegrityProvider {
  if (Platform.OS === "ios") {
    return new IOSAppAttestProvider();
  }
  if (Platform.OS === "android") {
    return new AndroidPlayIntegrityProvider();
  }
  return new MockIntegrityProvider();
}
