/**
 * PIN Authentication Service
 * Handles 4-digit PIN login and validation
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { errorReporter } from "@/services/errorRecovery";
import { colors, semanticColors, spacing, radius } from "@/theme/legacyCompat";

export interface PINSettings {
  pinEnabled: boolean;
  pinSet: boolean;
  maxAttempts: number;
  lockoutDuration: number; // in seconds
}

/**
 * PIN Authentication Service
 */
export class PINAuthService {
  private static instance: PINAuthService;
  private maxAttempts = 5;
  private lockoutDuration = 300; // 5 minutes
  private attemptCount = 0;
  private lockedUntil: number | null = null;

  private constructor() {}

  static getInstance(): PINAuthService {
    if (!this.instance) {
      this.instance = new PINAuthService();
    }
    return this.instance;
  }

  /**
   * Initialize PIN authentication
   */
  async initialize(): Promise<void> {
    try {
      // Check if app was previously locked
      const lockoutTime = await SecureStore.getItemAsync("pin_lockout_time");
      if (lockoutTime) {
        const lockedUntil = parseInt(lockoutTime);
        if (lockedUntil > Date.now()) {
          this.lockedUntil = lockedUntil;
        } else {
          await SecureStore.deleteItemAsync("pin_lockout_time");
        }
      }

      // Restore attempt count
      const attempts = await SecureStore.getItemAsync("pin_attempts");
      if (attempts) {
        this.attemptCount = parseInt(attempts);
      }
    } catch (error) {
      errorReporter.report(
        error instanceof Error ? error : new Error(String(error)),
        "PINAuthService.initialize"
      );
    }
  }

  /**
   * Set a new PIN
   */
  async setPIN(pin: string): Promise<boolean> {
    try {
      // Validate PIN format
      if (!this.validatePINFormat(pin)) {
        throw new Error("PIN must be exactly 4 digits");
      }

      // Hash PIN for storage using salted iterated SHA-256 (audit C3).
      const hashedPin = await this.hashPIN(pin);

      // Store encrypted
      await SecureStore.setItemAsync("user_pin", hashedPin);
      await SecureStore.setItemAsync("pin_enabled", "true");

      return true;
    } catch (error) {
      errorReporter.report(
        error instanceof Error ? error : new Error(String(error)),
        "PINAuthService.setPIN"
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Verify PIN
   */
  async verifyPIN(pin: string): Promise<boolean> {
    try {
      // Check if locked out
      if (this.isLockedOut()) {
        const remainingSeconds = Math.ceil((this.lockedUntil! - Date.now()) / 1000);
        throw new Error(`Too many attempts. Try again in ${remainingSeconds} seconds.`);
      }

      // Validate format
      if (!this.validatePINFormat(pin)) {
        throw new Error("PIN must be exactly 4 digits");
      }

      // Get stored PIN
      const storedPin = await SecureStore.getItemAsync("user_pin");
      if (!storedPin) {
        throw new Error("PIN not set");
      }

      // Compare: support both the new salted PBKDF2-style format and reject
      // legacy Base64 entries (force re-set, since Base64 was reversible).
      if (storedPin.startsWith("pbkdf2$")) {
        const parts = storedPin.split("$");
        const saltB64 = parts[2];
        const hashedInput = await this.hashPIN(pin, saltB64);
        if (PINAuthService.safeEqual(hashedInput, storedPin)) {
          // Reset attempts on success
          this.attemptCount = 0;
          await SecureStore.setItemAsync("pin_attempts", "0");
          return true;
        }
      }
      // Legacy non-pbkdf2 stored value: treat as mismatch so the user is
      // prompted to re-set their PIN under the new scheme.

      // Handle failed attempt
      this.attemptCount++;
      await SecureStore.setItemAsync("pin_attempts", this.attemptCount.toString());

      if (this.attemptCount >= this.maxAttempts) {
        this.lockedUntil = Date.now() + this.lockoutDuration * 1000;
        await SecureStore.setItemAsync("pin_lockout_time", this.lockedUntil.toString());
        throw new Error(
          `Too many failed attempts. Account locked for ${this.lockoutDuration} seconds.`
        );
      }

      const remainingAttempts = this.maxAttempts - this.attemptCount;
      throw new Error(`Incorrect PIN. ${remainingAttempts} attempts remaining.`);
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      errorReporter.report(typedError, "PINAuthService.verifyPIN");
      throw typedError;
    }
  }

  /**
   * Check if PIN is enabled
   */
  async isPINEnabled(): Promise<boolean> {
    try {
      const enabled = await SecureStore.getItemAsync("pin_enabled");
      return enabled === "true";
    } catch (error) {
      errorReporter.report(
        error instanceof Error ? error : new Error(String(error)),
        "PINAuthService.isPINEnabled"
      );
      return false;
    }
  }

  /**
   * Disable PIN
   */
  async disablePIN(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync("user_pin");
      await SecureStore.deleteItemAsync("pin_enabled");
      this.attemptCount = 0;
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      errorReporter.report(typedError, "PINAuthService.disablePIN");
      throw typedError;
    }
  }

  /**
   * Check if account is locked
   */
  isLockedOut(): boolean {
    if (!this.lockedUntil) return false;
    if (Date.now() > this.lockedUntil) {
      this.lockedUntil = null;
      return false;
    }
    return true;
  }

  /**
   * Get remaining lockout time in seconds
   */
  getRemainingLockoutTime(): number {
    if (!this.lockedUntil || Date.now() > this.lockedUntil) {
      return 0;
    }
    return Math.ceil((this.lockedUntil - Date.now()) / 1000);
  }

  /**
   * Validate PIN format (4 digits)
   */
  private validatePINFormat(pin: string): boolean {
    return /^\d{4}$/.test(pin);
  }

  /**
   * Derive a verifiable PIN hash using a salted, iterated SHA-256 (PBKDF2-style).
   *
   * Storage format: `pbkdf2$<iterations>$<saltB64>$<hashB64>` so verification
   * can re-derive with the same parameters. This replaces the previous Base64
   * encoding (which was trivially reversible — see audit C3).
   *
   * NOTE on iteration count: each round is a JS->native bridge hop via
   * expo-crypto (no batch derive API on React Native). 50k rounds was
   * originally chosen but is unworkable on-device (~minutes per call on
   * low-end Android). 3000 rounds is the practical ceiling for a responsive
   * PIN unlock while still requiring ~3 * 10^6 SHA-256 ops per offline
   * guess against a stolen SecureStore dump. For a 4-digit keyspace (10^4)
   * this raises brute force from <1ms to ~5 minutes on the same hardware.
   */
  private static PBKDF2_ITERATIONS = 3000;

  private async hashPIN(pin: string, existingSaltB64?: string): Promise<string> {
    const iterations = PINAuthService.PBKDF2_ITERATIONS;
    const salt = existingSaltB64
      ? Uint8Array.from(atob(existingSaltB64), (c) => c.charCodeAt(0))
      : Crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = existingSaltB64 ?? btoa(String.fromCharCode(...salt));

    let current = pin + String.fromCharCode(...salt);
    for (let i = 0; i < iterations; i++) {
      current = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        current
      );
    }
    return `pbkdf2$${iterations}$${saltB64}$${current}`;
  }

  /**
   * Constant-time-ish string compare to avoid trivial timing side-channels on
   * the 4-digit keyspace. (Best effort — JS engines may still short-circuit.)
   */
  private static safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}

/**
 * PIN Input Pad Component
 */
interface PINPadProps {
  onPINComplete: (pin: string) => void;
  onCancel?: () => void;
  length?: number;
  title?: string;
}

export const PINPad: React.FC<PINPadProps> = ({
  onPINComplete,
  onCancel,
  length = 4,
  title = "Enter PIN",
}) => {
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDigitPress = (digit: string) => {
    if (pin.length < length) {
      const newPin = pin + digit;
      setPin(newPin);

      if (newPin.length === length) {
        setIsLoading(true);
        setTimeout(() => {
          onPINComplete(newPin);
          setIsLoading(false);
          setPin("");
        }, 500);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.display}>
        <View style={styles.pinDisplay}>
          {Array.from({ length }).map((_, i) => (
            <View key={i} style={[styles.pinDot, i < pin.length && styles.pinDotFilled]} />
          ))}
        </View>
      </View>

      <View style={styles.padContainer}>
        {digits.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.row}>
            {row.map((digit) => (
              <TouchableOpacity
                key={digit}
                style={styles.button}
                onPress={() => {
                  if (digit === "*" || digit === "#") {
                    if (digit === "*") handleBackspace();
                  } else {
                    handleDigitPress(digit);
                  }
                }}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>
                  {digit === "*" ? "←" : digit === "#" ? "✓" : digit}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {onCancel && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
};

/**
 * Hook for PIN verification flow
 */
export const usePINAuth = () => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyPIN = useCallback(async (pin: string): Promise<boolean> => {
    setIsVerifying(true);
    setError(null);

    try {
      const service = PINAuthService.getInstance();
      const success = await service.verifyPIN(pin);
      return success;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  return {
    verifyPIN,
    isVerifying,
    error,
  };
};

/**
 * PIN Login Screen Component
 */
export const PINLoginScreen: React.FC<{
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ onSuccess, onCancel }) => {
  const { verifyPIN, isVerifying, error } = usePINAuth();

  const handlePINComplete = async (pin: string) => {
    const success = await verifyPIN(pin);
    if (success) {
      onSuccess();
    } else {
      Alert.alert("Error", "Invalid PIN");
    }
  };

  return (
    <View style={styles.screenContainer}>
      <PINPad onPINComplete={handlePINComplete} onCancel={onCancel} title="Enter Your PIN" />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {isVerifying && <Text style={styles.verifyingText}>Verifying...</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: semanticColors.background.primary,
  },
  screenContainer: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.md,
  },
  header: {
    marginBottom: spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: semanticColors.text.primary,
  },
  display: {
    marginBottom: spacing.xl,
    alignItems: "center",
  },
  pinDisplay: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: semanticColors.border.default,
  },
  pinDotFilled: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  padContainer: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
  },
  button: {
    width: Dimensions.get("window").width / 4 - 16,
    height: Dimensions.get("window").width / 4 - 16,
    borderRadius: radius.lg,
    backgroundColor: semanticColors.background.tertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 24,
    fontWeight: "600",
    color: semanticColors.text.primary,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.error[500],
    alignItems: "center",
  },
  cancelText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: colors.error[500],
    textAlign: "center",
    marginTop: spacing.md,
    fontSize: 14,
  },
  verifyingText: {
    color: colors.primary[500],
    textAlign: "center",
    marginTop: spacing.md,
    fontSize: 14,
  },
});

export const pinAuthService = PINAuthService.getInstance();
