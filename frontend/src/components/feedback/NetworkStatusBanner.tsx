import React, { useCallback, useEffect, useState } from "react";
import { useNetworkStore } from "../../store/networkStore";
import { getOfflineQueue } from "../../services/offline/offlineStorage";
import { syncOfflineQueue } from "../../services/api";
import { OperationalSyncBanner } from "./OperationalSyncBanner";

interface NetworkStatusBannerProps {
  onSyncPress?: () => void;
}

export const NetworkStatusBanner: React.FC<NetworkStatusBannerProps> = ({ onSyncPress }) => {
  const { isOnline, isInternetReachable, isRestrictedMode } = useNetworkStore();
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const updateQueueCount = useCallback(async () => {
    const queue = await getOfflineQueue();
    setQueueCount(queue.length);
  }, []);

  useEffect(() => {
    void updateQueueCount();
  }, [isOnline, updateQueueCount]);

  const handleSync = useCallback(async () => {
    if (!isOnline || syncing) return;

    setSyncing(true);
    try {
      const results = await syncOfflineQueue();
      await updateQueueCount();

      if (onSyncPress) {
        onSyncPress();
      }

      __DEV__ && console.log("Sync completed:", results);
    } catch (error) {
      __DEV__ && console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  }, [isOnline, onSyncPress, syncing, updateQueueCount]);

  if (isRestrictedMode) {
    return (
      <OperationalSyncBanner
        compact
        tone="failed"
        title="Restricted mode"
        message="Connect to Wi-Fi to resume live inventory updates."
      />
    );
  }

  const hasLiveConnection = isOnline && isInternetReachable !== false;

  if (hasLiveConnection && queueCount === 0) {
    return null;
  }

  return (
    <OperationalSyncBanner
      compact
      tone={hasLiveConnection ? "pending" : "offline"}
      title={hasLiveConnection ? "Pending offline work" : "Offline mode active"}
      message={
        hasLiveConnection
          ? "Upload locally saved inventory changes before closing this workflow."
          : "Inventory changes will stay on this device and sync when a live connection returns."
      }
      pendingCount={queueCount > 0 ? queueCount : undefined}
      actionLabel={
        hasLiveConnection && queueCount > 0 ? (syncing ? "Syncing" : "Sync now") : undefined
      }
      actionHint="Attempts to upload locally saved offline inventory changes"
      actionBusy={syncing}
      actionDisabled={syncing}
      onActionPress={hasLiveConnection && queueCount > 0 ? handleSync : undefined}
    />
  );
};

export default NetworkStatusBanner;
