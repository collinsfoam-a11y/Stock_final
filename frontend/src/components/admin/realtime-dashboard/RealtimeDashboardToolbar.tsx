import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { auroraTheme } from "@/theme/auroraTheme";
import {
  IS_WEB,
  Summary,
} from "@/components/admin/realtime-dashboard/realtimeDashboardShared";
import { DashboardConnectionState } from "@/components/admin/realtime-dashboard/realtimeDashboardLive";

interface RealtimeDashboardToolbarProps {
  actionsDisabled?: boolean;
  autoRefresh: boolean;
  connectionState: DashboardConnectionState;
  onExportCSV: () => void;
  onOpenColumnSettings: () => void;
  onToggleAutoRefresh: () => void;
  onToggleVerifiedFilter: (value: boolean | null) => void;
  summary: Summary | null;
  verifiedFilter: boolean | null;
}

export function RealtimeDashboardToolbar({
  actionsDisabled = false,
  autoRefresh,
  connectionState,
  onExportCSV,
  onOpenColumnSettings,
  onToggleAutoRefresh,
  onToggleVerifiedFilter,
  summary,
  verifiedFilter,
}: RealtimeDashboardToolbarProps) {
  return (
    <>
      <View style={styles.controls}>
        <View style={styles.controlsLeft}>
          <FilterButton
            active={verifiedFilter === null}
            disabled={actionsDisabled}
            label="All"
            onPress={() => onToggleVerifiedFilter(null)}
          />
          <FilterButton
            active={verifiedFilter === true}
            disabled={actionsDisabled}
            label="Verified"
            onPress={() => onToggleVerifiedFilter(true)}
          />
          <FilterButton
            active={verifiedFilter === false}
            disabled={actionsDisabled}
            label="Pending"
            onPress={() => onToggleVerifiedFilter(false)}
          />
        </View>

        <View style={styles.controlsRight}>
          <TouchableOpacity
            style={[styles.iconButton, actionsDisabled && styles.disabledButton]}
            onPress={onToggleAutoRefresh}
            disabled={actionsDisabled}
          >
            <Ionicons
              name={autoRefresh ? "sync" : "sync-outline"}
              size={20}
              color={
                autoRefresh
                  ? auroraTheme.colors.primary[500]
                  : auroraTheme.colors.text.secondary
              }
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, actionsDisabled && styles.disabledButton]}
            onPress={onOpenColumnSettings}
            disabled={actionsDisabled}
          >
            <Ionicons
              name="options"
              size={20}
              color={auroraTheme.colors.text.primary}
            />
          </TouchableOpacity>
          {IS_WEB && (
            <TouchableOpacity
              style={[styles.iconButton, actionsDisabled && styles.disabledButton]}
              onPress={onExportCSV}
              disabled={actionsDisabled}
            >
              <Ionicons
                name="download"
                size={20}
                color={auroraTheme.colors.text.primary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {summary && (
        <View style={styles.generationInfo}>
          <Text style={styles.generationText}>
            Generated in {summary.generation_time_ms.toFixed(0)}ms •{" "}
            {summary.filtered_records} of {summary.total_records} records
          </Text>
          <View style={styles.liveIndicator}>
            <View
              style={[
                styles.liveDot,
                connectionState.tone === "warning" && styles.liveDotWarning,
                connectionState.tone === "muted" && styles.liveDotMuted,
              ]}
            />
            <Text
              style={[
                styles.liveText,
                connectionState.tone === "warning" && styles.liveTextWarning,
                connectionState.tone === "muted" && styles.liveTextMuted,
              ]}
            >
              {connectionState.label}
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

function FilterButton({
  active,
  disabled = false,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.md,
  },
  controlsLeft: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
  },
  controlsRight: {
    flexDirection: "row",
    gap: auroraTheme.spacing.sm,
  },
  filterButton: {
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.sm,
    backgroundColor: auroraTheme.colors.surface.base,
    borderRadius: auroraTheme.borderRadius.sm,
  },
  filterButtonText: {
    fontSize: 13,
    color: auroraTheme.colors.text.secondary,
  },
  filterButtonTextActive: {
    color: auroraTheme.colors.primary[500],
    fontWeight: "600",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: auroraTheme.colors.surface.base,
    justifyContent: "center",
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.45,
  },
  generationInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: auroraTheme.spacing.md,
    paddingHorizontal: auroraTheme.spacing.sm,
  },
  generationText: {
    fontSize: 12,
    color: auroraTheme.colors.text.secondary,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  liveDotWarning: {
    backgroundColor: "#FF9800",
  },
  liveDotMuted: {
    backgroundColor: auroraTheme.colors.text.secondary,
  },
  liveText: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "600",
  },
  liveTextWarning: {
    color: "#FF9800",
  },
  liveTextMuted: {
    color: auroraTheme.colors.text.secondary,
  },
});
