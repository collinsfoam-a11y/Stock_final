import { useState, useCallback, useEffect } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { useAuthStore } from "../../../store/authStore";
import { useSettingsStore } from "../../../store/settingsStore";

export type LoginMode = "pin" | "credentials";

export type LoginResult = {
  success: boolean;
  message?: string;
  code?: string;
};

export const getLoginErrorAlert = (
  result: LoginResult,
  mode: LoginMode
): { title: string; message: string } => {
  if (result.code === "AUTH_SESSION_CONFLICT") {
    return {
      title: "Session Conflict",
      message:
        "This account is already active on another device.\n\nPlease ask your administrator to logout all existing sessions before you can sign in here.",
    };
  }

  if (result.code === "AUTH_INVALID_CREDENTIALS") {
    return mode === "credentials"
      ? {
          title: "Invalid Credentials",
          message: result.message || "Incorrect username or password.",
        }
      : {
          title: "Invalid PIN",
          message: result.message || "Incorrect PIN. Please try again.",
        };
  }

  if (
    result.code === "NETWORK_CONNECTION_ERROR" ||
    result.code === "NETWORK_TIMEOUT" ||
    result.code === "NETWORK_NOT_ALLOWED"
  ) {
    return {
      title: "Connection Issue",
      message:
        result.message ||
        "Unable to connect to server. Check internet and backend connection, then try again.",
    };
  }

  if (result.code === "SERVER_ERROR") {
    return {
      title: "Server Error",
      message: result.message || "Server issue. Please try again in a moment.",
    };
  }

  return {
    title: "Login Failed",
    message:
      result.message ||
      (mode === "credentials"
        ? "Unable to sign in. Please try again."
        : "PIN login failed. Please try again."),
  };
};

export function useLoginFlow() {
  const router = useRouter();
  const { login, loginWithPin, authenticateWithBiometrics, isLoading, lastLoggedUser } = useAuthStore();
  const biometricAuthEnabled = useSettingsStore((state) => state.settings.biometricAuth);
  
  const [loginMode, setLoginMode] = useState<LoginMode>("credentials");
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    pin?: string;
    username?: string;
    password?: string;
  }>({});

  // Set initial mode based on last logged user
  useEffect(() => {
    const isE2E =
      process.env.EXPO_PUBLIC_E2E === "true" ||
      (Platform.OS === "web" &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("e2e") === "1");
    if (isE2E) {
      return;
    }
    if (lastLoggedUser?.has_pin) {
      setLoginMode("pin");
    }
  }, [lastLoggedUser]);

  const handlePinChange = useCallback(
    async (newPin: string) => {
      // Only allow numeric input
      if (!/^\d*$/.test(newPin)) return;

      // Prevent input while loading
      if (isLoading) return;

      setPin(newPin);
      if (newPin.length > pin.length) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Auto-login when 4 digits entered
      if (newPin.length === 4) {
        if (!lastLoggedUser?.username) {
          Alert.alert(
            "First Login Required",
            "Please sign in with username and password first, then set your PIN."
          );
          setPin("");
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Small delay to ensure UI updates before freezing for network request
        setTimeout(async () => {
          try {
            const result = await loginWithPin(newPin, lastLoggedUser.username);
            if (!result.success) {
              const alertConfig = getLoginErrorAlert(result, "pin");
              Alert.alert(alertConfig.title, alertConfig.message, [{ text: "OK" }]);
              setPin("");
            }
          } catch (_error) {
            Alert.alert("Connection Issue", "Unable to connect to server. Please try again.");
            setPin("");
          }
        }, 100);
      }
    },
    [pin, loginWithPin, isLoading, lastLoggedUser]
  );

  const handleBiometricAuth = useCallback(async () => {
    if (isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!biometricAuthEnabled) {
      Alert.alert(
        "Biometric Unlock Unavailable",
        "Biometric login is not enabled on this device yet."
      );
      return;
    }

    const result = await authenticateWithBiometrics();
    if (!result.success) {
      Alert.alert("Biometric Login Failed", result.message || "Unable to sign in with biometrics.");
    }
  }, [authenticateWithBiometrics, biometricAuthEnabled, isLoading]);

  const handleForgotPin = useCallback(() => {
    Alert.alert("Forgot PIN", "Please contact your administrator to reset your PIN.");
  }, []);

  const handleForgotPassword = useCallback(() => {
    router.push("/forgot-password");
  }, [router]);

  const handleLogin = useCallback(async () => {
    const newErrors: { pin?: string; username?: string; password?: string } = {};
    setErrors(newErrors);
    try {
      if (loginMode === "pin") {
        if (!lastLoggedUser?.username) {
          Alert.alert("First Login Required", "Please sign in with username and password first.");
          return;
        }
        if (pin.length !== 4) {
          setErrors({ pin: "Please enter a 4-digit PIN" });
          return;
        }
        const result = await loginWithPin(pin, lastLoggedUser.username);
        if (!result.success) {
          const alertConfig = getLoginErrorAlert(result, "pin");
          Alert.alert(alertConfig.title, alertConfig.message);
          setPin("");
        }
      } else {
        if (!username.trim()) {
          setErrors({ username: "Username is required" });
          return;
        }
        if (!password.trim()) {
          setErrors({ password: "Password is required" });
          return;
        }
        const result = await login(username, password);
        if (!result.success) {
          const alertConfig = getLoginErrorAlert(result, "credentials");
          Alert.alert(alertConfig.title, alertConfig.message);
          setPassword("");
        }
      }
    } catch (_error) {
      Alert.alert("Connection Issue", "Unable to connect to server. Please try again.");
    }
  }, [loginMode, pin, username, password, login, loginWithPin, lastLoggedUser]);

  const toggleLoginMode = useCallback(() => {
    if (loginMode === "credentials" && (!lastLoggedUser || !lastLoggedUser.has_pin)) {
      Alert.alert(
        "First Login Required",
        "Please login with username/password and set a PIN first."
      );
      return;
    }
    const newMode: LoginMode = loginMode === "pin" ? "credentials" : "pin";
    setLoginMode(newMode);
    setPin("");
    setUsername("");
    setPassword("");
    setErrors({});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [loginMode, lastLoggedUser]);

  return {
    loginMode,
    pin,
    username,
    password,
    errors,
    isLoading,
    lastLoggedUser,
    biometricAuthEnabled,
    setLoginMode,
    setUsername,
    setPassword,
    handlePinChange,
    handleBiometricAuth,
    handleForgotPin,
    handleForgotPassword,
    handleLogin,
    toggleLoginMode,
  };
}
