import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ModernButton from "@/components/ui/ModernButton";
import { useUiTokens } from "@/hooks/useUiTokens";

interface ItemSubmitBarProps {
  canSubmit?: boolean;
  submitting: boolean;
  submitCountdown: number | null;
  onCancelSubmit: () => void;
  onSubmitAndScanNext?: () => void;
  onSubmitAndStay?: () => void;
  onSubmit?: () => void;
}

export function ItemSubmitBar({
  canSubmit = true,
  submitting,
  submitCountdown,
  onCancelSubmit,
  onSubmitAndScanNext,
  onSubmitAndStay,
  onSubmit,
}: ItemSubmitBarProps) {
  const insets = useSafeAreaInsets();
  const uiTokens = useUiTokens();
  const isUndoState = submitCountdown !== null;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          paddingHorizontal: uiTokens.spacing.md,
          paddingTop: uiTokens.spacing.md,
          borderTopWidth: 1,
          borderTopColor: uiTokens.colors.border,
          backgroundColor: uiTokens.colors.surface,
        },
        buttonRow: {
          flexDirection: "row",
          gap: uiTokens.spacing.sm,
          alignItems: "center",
        },
        flexPrimary: {
          flex: 2,
        },
        flexSecondary: {
          flex: 1,
        },
      }),
    [uiTokens]
  );

  if (isUndoState) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingBottom: Math.max(uiTokens.spacing.md, insets.bottom + uiTokens.spacing.sm),
          },
        ]}
      >
        <ModernButton
          title={`Undo (${submitCountdown}s)`}
          onPress={onCancelSubmit}
          variant="danger"
          icon="close-circle"
          fullWidth
          accessibilityHint="Cancels the pending item verification"
        />
      </View>
    );
  }

  const hasDualActions = Boolean(onSubmitAndScanNext && onSubmitAndStay);

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(uiTokens.spacing.md, insets.bottom + uiTokens.spacing.sm),
        },
      ]}
    >
      {hasDualActions ? (
        <View style={styles.buttonRow}>
          <View style={styles.flexSecondary}>
            <ModernButton
              title="Save & Stay"
              onPress={onSubmitAndStay!}
              disabled={!canSubmit || submitting}
              loading={submitting}
              variant="secondary"
              icon="save-outline"
              accessibilityHint="Saves the count line and remains on the item detail screen"
            />
          </View>
          <View style={styles.flexPrimary}>
            <ModernButton
              title="Save & Scan Next"
              onPress={onSubmitAndScanNext!}
              disabled={!canSubmit || submitting}
              loading={submitting}
              variant="primary"
              icon="camera-outline"
              accessibilityHint="Saves count line and immediately opens scanner for next item"
            />
          </View>
        </View>
      ) : (
        <ModernButton
          title={canSubmit ? "Save & Verify" : "Enter Count to Verify"}
          onPress={onSubmit || (() => {})}
          disabled={!canSubmit}
          loading={submitting}
          variant="primary"
          icon="checkmark-circle"
          fullWidth
          accessibilityHint={
            canSubmit
              ? "Starts the save countdown for this counted item"
              : "Enter a quantity greater than zero before saving"
          }
        />
      )}
    </View>
  );
}
