import { logger } from '@/services/logging';
/**
 * Sync Status Bar Component
 * Shows sync status, queue count, and allows manual sync
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { forceSync, SyncResult } from "../services/syncService";
import {
  refreshSyncStatus,
  subscribeSyncStatus,
  type SyncStatusSnapshot,
} from "../services/syncStatusPolling";
import { useNetworkStore } from "../store/networkStore";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";

export const SyncStatusBar: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatusSnapshot | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const isOnline = useNetworkStore((state: any) => state.isOnline);
  const syncResultTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    void refreshSyncStatus();
    return () => {
      unsubscribe();
      if (syncResultTimerRef.current) {
        clearTimeout(syncResultTimerRef.current);
        syncResultTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      void refreshSyncStatus();
    }
  }, [isOnline]);

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const result = await forceSync({
        onProgress: (current, total) => {
          logger.debug(`Sync: ${current}/${total}`);
        },
      });

      setSyncResult(result);
      await refreshSyncStatus();

      // Clear result after 3 seconds
      if (syncResultTimerRef.current) {
        clearTimeout(syncResultTimerRef.current);
      }
      syncResultTimerRef.current = setTimeout(() => {
        setSyncResult(null);
        syncResultTimerRef.current = null;
      }, 3000);
    } catch (error: any) {
      logger.error("Sync error:", error);
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
    <View
      style={[
        styles.container,
        // Removed offlineContainer style to keep bar consistent blue
      ]}
    >
      {/* Online indicator */}
      {/* Status Indicators */}
      <View style={styles.statusRow}>
        {/* SQL Source Indicator */}
        <View style={styles.indicatorItem}>
          <Ionicons
            name={syncStatus.isOnline ? "server" : "server-outline"}
            size={16}
            color={syncStatus.isOnline ? uiColors.success[500] : uiColors.error[500]} // Green or Red
          />
          <Text style={styles.statusText}>Source</Text>
        </View>

        {/* Mongo/App Data Indicator */}
        <View style={styles.indicatorItem}>
          <Ionicons
            name="leaf" // Leaf for Mongo/App Data
            size={16}
            color={uiColors.success[500]} // Always green for local app data
          />
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
            <ActivityIndicator size="small" color={uiSemanticColors.text.inverse} />
          ) : (
            <Ionicons name="sync" size={16} color={uiSemanticColors.text.inverse} />
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
    backgroundColor: uiColors.info[500],
    padding: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  offlineContainer: {
    backgroundColor: uiColors.error[500],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12, // Increased gap between status items
  },
  indicatorItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 12,
    fontWeight: "600",
  },
  queueRow: {
    flex: 1,
  },
  queueText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 12,
  },
  syncButton: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
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
    color: uiSemanticColors.text.inverse,
    fontSize: 12,
    fontWeight: "600",
  },
  resultRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  successText: {
    color: uiColors.success[500],
    fontSize: 11,
    fontWeight: "600",
  },
  errorText: {
    color: uiColors.warning[300],
    fontSize: 11,
    fontWeight: "600",
  },
  lastSyncText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 11,
  },
});
