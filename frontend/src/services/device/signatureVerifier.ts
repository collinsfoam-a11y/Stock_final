import * as ed from "@noble/ed25519";
import { createLogger } from "../logging";
import { ScannerConfigResponse } from "./scannerConfigurationManager";

const log = createLogger("signatureVerifier");

export class SignatureVerifier {
  // In a real app, this public key would be baked into the binary securely or fetched via a trusted PKI
  // Hex representation of the Ed25519 public key.
  private static TRUSTED_PUBLIC_KEYS: Record<string, string> = {
    "prod-key-v1": "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
  };

  /**
   * Verifies the Ed25519 signature of the configuration payload.
   * 
   * It reconstructs the canonical string representation of the configuration,
   * hashes it (or signs it directly depending on standard, noble handles message directly),
   * and verifies it against the signature provided in metadata.
   */
  public static async verifyConfiguration(payload: ScannerConfigResponse): Promise<boolean> {
    try {
      const { metadata, configuration } = payload;
      
      if (!metadata.signature || !metadata.signatureAlgorithm || !metadata.keyId) {
        log.warn("Missing signature metadata components");
        return false;
      }

      if (metadata.signatureAlgorithm !== "Ed25519") {
        log.warn("Unsupported signature algorithm", { alg: metadata.signatureAlgorithm });
        return false;
      }

      const publicKeyHex = this.TRUSTED_PUBLIC_KEYS[metadata.keyId];
      if (!publicKeyHex) {
        log.warn("Unknown Key ID provided", { keyId: metadata.keyId });
        return false;
      }

      // Reconstruct the message that was signed.
      // A common standard is to stringify the configuration object deterministically.
      // For simplicity in this implementation, we assume the backend signs 
      // the JSON.stringify of the `configuration` object, identically formatted.
      // In production, we'd use a deterministic JSON stringifier or canonical JSON.
      const messageStr = JSON.stringify(configuration);
      const messageBytes = new TextEncoder().encode(messageStr);

      // @noble/ed25519 requires Uint8Array for signatures and public keys.
      // Convert hex strings to Uint8Array using ed.etc.hexToBytes.
      const signatureBytes = ed.etc.hexToBytes(metadata.signature);
      const publicKeyBytes = ed.etc.hexToBytes(publicKeyHex);
      const isValid = await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
      
      if (!isValid) {
        log.error("Ed25519 Signature Verification Failed!");
        return false;
      }

      return true;
    } catch (error) {
      log.error("Error during signature verification", error);
      return false;
    }
  }
}
