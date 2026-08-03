import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { DashboardConnectionState } from "@/components/admin/realtime-dashboard/realtimeDashboardLive";
import { Summary } from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getAccessibleButtonProps, getMinimumTouchTargetStyle } from "@/utils/accessibility";

import { AppTouchable } from "@/components/ui/AppTouchable";

interface RealtimeDashboardToolbarProps {
  actionsDisabled?: boolean;
  autoRefresh: boolean;
  connectionState: DashboardConnectionState;
  onExportCSV: () => void;
  onExportXLSX: () => void;
  onOpenColumnSettings: () => void;
  onToggleAutoRefresh: () => void;
  onToggleVerifiedFilter: (value: boolean | null) => void;
  summary: Summary | null;
  verifiedFilter: boolean | null;
}

type ToolbarTokens = ReturnType<typeof useUiTokens>;
type ToolbarStyles = ReturnType<typeof createStyles>;

export function RealtimeDashboardToolbar({
  actionsDisabled = false,
  autoRefresh,
  connectionState,
  onExportCSV,
  onExportXLSX,
  onOpenColumnSettings,
  onToggleAutoRefresh,
  onToggleVerifiedFilter,
  summary,
  verifiedFilter,
}: RealtimeDashboardToolbarProps) {
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const liveToneColor =
    connectionState.tone === "warning"
      ? uiTokens.colors.warning
      : connectionState.tone === "muted"
        ? uiTokens.colors.textSecondary
        : uiTokens.colors.success;

  return (
    <>
      <View style={styles.controls}>
        <View style={styles.controlsLeft}>
          <FilterButton
            active={verifiedFilter === null}
            disabled={actionsDisabled}
            label="All"
            onPress={() => onToggleVerifiedFilter(null)}
            styles={styles}
          />
          <FilterButton
            active={verifiedFilter === true}
            disabled={actionsDisabled}
            label="Verified"
            onPress={() => onToggleVerifiedFilter(true)}
            styles={styles}
          />
          <FilterButton
            active={verifiedFilter === false}
            disabled={actionsDisabled}
            label="Pending"
            onPress={() => onToggleVerifiedFilter(false)}
            styles={styles}
          />
        </View>

        <View style={styles.controlsRight}>
          <AppTouchable
            {...getAccessibleButtonProps({
              label: `${autoRefresh ? "Disable" : "Enable"} realtime auto refresh`,
              disabled: actionsDisabled,
              selected: autoRefresh,
            })}
            style={[styles.iconButton, actionsDisabled && styles.disabledButton]}
            onPress={onToggleAutoRefresh}
            disabled={actionsDisabled}>
            <Ionicons
              name={autoRefresh ? "sync" : "sync-outline"}
              size={20}
              color={autoRefresh ? uiTokens.colors.accent : uiTokens.colors.textSecondary}
            />
          </AppTouchable>
          <AppTouchable
            {...getAccessibleButtonProps({
              label: "Open realtime dashboard column settings",
              disabled: actionsDisabled,
            })}
            style={[styles.iconButton, actionsDisabled && styles.disabledButton]}
            onPress={onOpenColumnSettings}
            disabled={actionsDisabled}
            accessibilityLabel="Options">
            <Ionicons name="options" size={20} color={uiTokens.colors.textPrimary} />
          </AppTouchable>
          <ExportButton
            disabled={actionsDisabled}
            label="ERPNext CSV"
            onPress={onExportCSV}
            styles={styles}
          />
          <ExportButton
            disabled={actionsDisabled}
            label="ERPNext XLSX"
            onPress={onExportXLSX}
            styles={styles}
          />
        </View>
      </View>
      <Text style={styles.exportHelpText}>
        Blank ID inserts new rows. Keep ID to update existing ERPNext records.
      </Text>
      {summary && (
        <View style={styles.generationInfo}>
          <Text style={styles.generationText}>
            Generated in {summary.generation_time_ms.toFixed(0)}ms - {summary.filtered_records} of{" "}
            {summary.total_records} records
          </Text>
          <View style={styles.liveIndicator} accessibilityLabel={connectionState.label}>
            <View style={[styles.liveDot, { backgroundColor: liveToneColor }]} />
            <Text style={[styles.liveText, { color: liveToneColor }]}>{connectionState.label}</Text>
          </View>
        </View>
      )}
    </>
  );
}

function ExportButton({
  disabled = false,
  label,
  onPress,
  styles,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  styles: ToolbarStyles;
}) {
  return (
    <AppTouchable
      {...getAccessibleButtonProps({ label: `Export ${label}`, disabled })}
      style={[styles.exportButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
 >
      <Text style={styles.exportButtonText}>{label}</Text>
    </AppTouchable>
  );
}

function FilterButton({
  active,
  disabled = false,
  label,
  onPress,
  styles,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  styles: ToolbarStyles;
}) {
  return (
    <AppTouchable
      {...getAccessibleButtonProps({
        label: `Show ${label.toLowerCase()} items`,
        disabled,
        selected: active,
      })}
      style={[styles.filterButton, active && styles.filterButtonActive, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
 >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </AppTouchable>
  );
}

const createStyles = (uiTokens: ToolbarTokens) =>
  StyleSheet.create({
    controls: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.md,
    },
    controlsLeft: {
      flexDirection: "row",
      gap: uiTokens.spacing.sm,
    },
    controlsRight: {
      flexDirection: "row",
      gap: uiTokens.spacing.sm,
    },
    filterButton: {
      ...getMinimumTouchTargetStyle(),
      paddingHorizontal: uiTokens.spacing.md,
      backgroundColor: uiTokens.colors.surface,
      borderRadius: uiTokens.radius.sm,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
      justifyContent: "center",
    },
    filterButtonActive: {
      borderColor: uiTokens.colors.accent,
    },
    filterButtonText: {
      fontSize: 13,
      color: uiTokens.colors.textSecondary,
    },
    filterButtonTextActive: {
      color: uiTokens.colors.accent,
      fontWeight: "600",
    },
    iconButton: {
      ...getMinimumTouchTargetStyle(),
      borderRadius: uiTokens.radius.full,
      backgroundColor: uiTokens.colors.surface,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    disabledButton: {
      opacity: 0.45,
    },
    generationInfo: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: uiTokens.spacing.md,
      paddingHorizontal: uiTokens.spacing.sm,
    },
    exportHelpText: {
      fontSize: 12,
      color: uiTokens.colors.textSecondary,
      marginBottom: uiTokens.spacing.sm,
      paddingHorizontal: uiTokens.spacing.xs,
    },
    generationText: {
      fontSize: 12,
      color: uiTokens.colors.textSecondary,
    },
    liveIndicator: {
      flexDirection: "row",
      alignItems: "center",
      gap: uiTokens.spacing.xs,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: uiTokens.radius.full,
    },
    exportButton: {
      ...getMinimumTouchTargetStyle(),
      minWidth: 52,
      borderRadius: uiTokens.radius.sm,
      backgroundColor: uiTokens.colors.surface,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: uiTokens.spacing.sm,
      borderWidth: 1,
      borderColor: uiTokens.colors.border,
    },
    exportButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: uiTokens.colors.textPrimary,
    },
    liveText: {
      fontSize: 12,
      fontWeight: "600",
    },
  });
