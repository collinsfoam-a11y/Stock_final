import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Modal } from "../ui/Modal";
import { verifyPin } from "@/services/api/api"; // We will add this next
import { useUiTokens } from "@/hooks/useUiTokens";
import type { ThemeTokens } from "@/theme/themeTokens";
import { colors as staticColors } from "@/theme/legacyCompat";

interface PinEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  action: string; // e.g., "delete_scan"
  staffUsername: string;
  entityId?: string;
}

export const PinEntryModal: React.FC<PinEntryModalProps> = ({
  visible,
  onClose,
  onSuccess,
  action,
  staffUsername,
  entityId,
}) => {
  const uiTokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(uiTokens), [uiTokens]);
  const [supervisorUsername, setSupervisorUsername] = useState("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!supervisorUsername || !pin || !reason) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyPin({
        supervisor_username: supervisorUsername,
        pin,
        action,
        reason,
        staff_username: staffUsername,
        entity_id: entityId,
      });

      if (result.success) {
        onSuccess();
        handleClose();
      } else {
        setError("Invalid credentials or insufficient permissions");
      }
    } catch (err: any) {
      // Handle generic errors or specific 401s
      if (err.message && err.message.includes("401")) {
        setError("Invalid PIN or Username");
      } else if (err.message && err.message.includes("403")) {
        setError("User is not a supervisor");
      } else {
        setError(err.message || "Verification failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSupervisorUsername("");
    setPin("");
    setReason("");
    setError(null);
    onClose();
  };

  return (
    <Modal visible={visible} onClose={handleClose} title="Supervisor Override Required">
      <View style={styles.container}>
        <Text style={styles.description}>This action requires supervisor authorization.</Text>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Supervisor Username</Text>
          <TextInput
            style={styles.input}
            value={supervisorUsername}
            onChangeText={setSupervisorUsername}
            placeholder="Enter username"
            placeholderTextColor={uiTokens.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="Enter PIN"
            placeholderTextColor={uiTokens.colors.textMuted}
            secureTextEntry
            keyboardType="numeric"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Reason for Override</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={reason}
            onChangeText={setReason}
            placeholder="Why is this action needed?"
            placeholderTextColor={uiTokens.colors.textMuted}
            multiline
            numberOfLines={3}
            autoCapitalize="sentences"
            autoCorrect={false}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={handleClose}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={staticColors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Authorize</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (uiTokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      paddingVertical: 10,
    },
    description: {
      color: uiTokens.colors.textSecondary,
      marginBottom: 20,
      fontSize: 14,
    },
    errorText: {
      color: uiTokens.colors.error,
      marginBottom: 15,
      fontSize: 14,
      fontWeight: "500",
    },
    inputGroup: {
      marginBottom: 16,
    },
    label: {
      color: uiTokens.colors.textPrimary,
      marginBottom: 8,
      fontSize: 14,
      fontWeight: "600",
    },
    input: {
      backgroundColor: uiTokens.colors.surfaceElevated,
      borderRadius: 8,
      padding: 12,
      color: uiTokens.colors.textPrimary,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    textArea: {
      height: 80,
      textAlignVertical: "top",
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 20,
      gap: 10,
    },
    button: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 8,
      minWidth: 100,
      alignItems: "center",
    },
    cancelButton: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    primaryButton: {
      backgroundColor: uiTokens.colors.accent,
    },
    cancelButtonText: {
      color: uiTokens.colors.textPrimary,
      fontWeight: "600",
    },
    // White regardless of theme: sits on the semantic accent-filled button.
    primaryButtonText: {
      color: staticColors.white,
      fontWeight: "600",
    },
  });
