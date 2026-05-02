/**
 * Sync Status Bar Component
 * Shows sync status, queue count, and allows manual sync
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getSyncStatus, forceSync, SyncResult } from "../services/syncService";
import { useNetworkStore } from "../store/networkStore";
import { colors, spacing, borderRadius, shadows } from "@/theme/unified";
import { operationalTheme } from "@/theme/operationalTheme";

interface SyncStatus {
  isOnline: boolean;
  queuedOperations: number;
  lastSync: string | null;
  cacheSize: number;
  needsSync: boolean;
}

export const SyncStatusBar: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const isOnline = useNetworkStore((state: any) => state.isOnline);

  const loadSyncStatus = React.useCallback(async () => {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error("Error loading sync status:", error);
    }
  }, []);

  useEffect(() => {
    loadSyncStatus();

    // Update sync status every 5 seconds
    const interval = setInterval(loadSyncStatus, 5000);

    return () => clearInterval(interval);
  }, [isOnline, loadSyncStatus]);

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await forceSync({
        onProgress: (current, total) => {
          console.log(`Sync: ${current}/${total}`);
        },
      });

      setSyncResult(result);

      // Reload status after sync
      setTimeout(loadSyncStatus, 1000);

      // Clear result after 3 seconds
      setTimeout(() => setSyncResult(null), 3000);
    } catch (error: any) {
      console.error("Sync error:", error);
      setSyncResult({
        success: 0,
        failed: 0,
        total: 0,
        errors: [{ id: "sync-error", error: error.message }],
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!syncStatus) {
    return null;
  }

  // Don't show if online and no queued operations
  if (syncStatus.isOnline && syncStatus.queuedOperations === 0 && !syncResult) {
    return null;
  }

  return (
    <View style={[styles.container]}>
      <View style={styles.statusRow}>
        <View style={styles.indicatorItem}>
          <Ionicons
            name={syncStatus.isOnline ? "server" : "server-outline"}
            size={16}
            color={syncStatus.isOnline ? colors.success[700] : colors.error[600]}
          />
          <Text style={styles.statusText}>Source</Text>
        </View>

        <View style={styles.indicatorItem}>
          <Ionicons name="leaf" size={16} color={colors.success[700]} />
          <Text style={styles.statusText}>App</Text>
        </View>
      </View>

      {/* Queue count */}
      {syncStatus.queuedOperations > 0 && (
        <View style={styles.queueRow}>
          <Text style={styles.queueText}>{syncStatus.queuedOperations} item(s) queued</Text>
        </View>
      )}

      {/* Sync button */}
      {syncStatus.isOnline && syncStatus.queuedOperations > 0 && (
        <TouchableOpacity
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="sync" size={16} color="#fff" />
          )}
          <Text style={styles.syncButtonText}>{isSyncing ? "Syncing..." : "Sync Now"}</Text>
        </TouchableOpacity>
      )}

      {/* Sync result */}
      {syncResult && (
        <View style={styles.resultRow}>
          {syncResult.success > 0 && (
            <Text style={styles.successText}>✓ {syncResult.success} synced</Text>
          )}
          {syncResult.failed > 0 && (
            <Text style={styles.errorText}>✗ {syncResult.failed} failed</Text>
          )}
        </View>
      )}

      {/* Last sync time */}
      {syncStatus.lastSync && syncStatus.queuedOperations === 0 && (
        <Text style={styles.lastSyncText}>
          Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: operationalTheme.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: operationalTheme.border,
    ...shadows.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  indicatorItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    color: operationalTheme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  queueRow: {
    flex: 1,
  },
  queueText: {
    color: operationalTheme.text,
    fontSize: 12,
    fontWeight: "600",
  },
  syncButton: {
    backgroundColor: operationalTheme.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  resultRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  successText: {
    color: colors.success[700],
    fontSize: 11,
    fontWeight: "600",
  },
  errorText: {
    color: colors.error[600],
    fontSize: 11,
    fontWeight: "600",
  },
  lastSyncText: {
    color: operationalTheme.textSecondary,
    fontSize: 11,
  },
});
