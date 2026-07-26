import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { createLogger } from "@/services/logging";
import { useUiTokens } from "@/hooks/useUiTokens";
import { useScanSessionStore } from "@/store/scanSessionStore";
import { useNetworkStore } from "@/store/networkStore";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";
import { getSessionStats } from "@/services/api/sessionManagementApi";

const log = createLogger("SessionStateBanner");

export function SessionStateBanner() {
  const tokens = useUiTokens();
  const { currentFloor, currentRack, activeSessionId } = useScanSessionStore();
  const isOnline = useNetworkStore((state) => state.isOnline);
  const { isConnected: isWsConnected } = useSessionWebSocket(activeSessionId || undefined);

  log.debug("WebSocket Status", {
    isWsConnected,
    activeSessionId,
    isOnline,
  });
  const [stats, setStats] = useState<{ scanned: number; expected: number } | null>(null);

  // Poll stats or rely on WS
  useEffect(() => {
    if (activeSessionId && isOnline) {
      getSessionStats(activeSessionId).then((res) => {
        if (res) {
          setStats({ scanned: res.scannedItems, expected: res.totalItems });
        }
      }).catch(() => {});
    }
  }, [activeSessionId, isOnline]);

  const getStatusColor = () => {
    if (!isOnline) return tokens.colors.error;
    if (isWsConnected) return tokens.colors.success;
    return tokens.colors.warning;
  };

  const getStatusText = () => {
    if (!isOnline) return "Offline";
    if (isWsConnected) return "Live";
    return "Paused";
  };

  return (
    <View style={[styles.container, { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.border }]}>
      <View style={styles.topRow}>
        <Text style={[styles.locationText, { color: tokens.colors.textPrimary }]}>
          <Text style={{ fontWeight: "700" }}>Floor {currentFloor || "--"}</Text> | Rack {currentRack || "--"}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      </View>
      <View style={styles.bottomRow}>
        <Text style={[styles.metaText, { color: tokens.colors.textSecondary }]}>
          Session #{activeSessionId?.slice(0, 8) || "---"}
        </Text>
        {stats && (
          <Text style={[styles.metaText, { color: tokens.colors.textSecondary }]}>
            Items {stats.scanned} / {stats.expected > 0 ? stats.expected : "?"}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: "column",
    gap: 4,
    zIndex: 10,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationText: {
    fontSize: 16,
  },
  metaText: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
