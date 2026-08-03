/**
 * Improved Staff Home Screen - Lavanya Mart Stock Verify
 * Enhanced UI/UX following V3 UI/UX Guide requirements
 * 
 * Features:
 * - Clear session context and progress indicators
 * - Enhanced offline status indicators
 * - Standardized error handling
 * - Improved accessibility compliance
 * - Optimized for fast warehouse operations
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ModernHeader } from "../../src/components/ui/ModernHeader";
import { ModernButton } from "../../src/components/ui/ModernButton";
import { ModernCard } from "../../src/components/ui/ModernCard";
import { StatsCard } from "../../src/components/ui/StatsCard";
import { useUiTokens } from "../../src/hooks/useUiTokens";
import { useAuthStore } from "../../src/store/authStore";
import { useScanSessionStore } from "../../src/store/scanSessionStore";
import apiService from "../../src/services/api/api";
import { colors as unifiedColors, spacing as unifiedSpacing, radius as unifiedRadius, textStyles } from "@/theme/unified";
import { OfflineStatusIndicator } from "../../src/components/ui/OfflineStatusIndicator";
import { StandardizedErrorCard } from "../../src/components/ui/StandardizedErrorCard";
import { SyncStatusPill } from "../../src/components/ui/SyncStatusPill";

// Mock network status hook - would be replaced with actual network status in real implementation
const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [queueDepth, setQueueDepth] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // Mock implementation - in real app this would come from a network status library
  return {
    isOnline,
    queueDepth,
    lastSyncTime,
    refreshStatus: () => {
      // Simulate refresh
    }
  };
};

const ImprovedHomeScreen = () => {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const scanStore: any = useScanSessionStore();
  const currentSession = scanStore?.activeSession;
  const setCurrentSession = scanStore?.setActiveSession || (() => {});
  const uiTokens = useUiTokens();
  const { isOnline, queueDepth, lastSyncTime, refreshStatus } = useNetworkStatus();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      
      const api: any = apiService;
      // Fetch all data concurrently
      const [activeSessionData, recentSessionsData, userData] = await Promise.all([
        api.getActiveSession ? api.getActiveSession() : Promise.resolve(null),
        api.getRecentSessions ? api.getRecentSessions(1, 5) : Promise.resolve({ items: [] }),
        api.getUserStats ? api.getUserStats(user?.id || "") : Promise.resolve(null)
      ]);
      
      setActiveSession(activeSessionData);
      setRecentSessions(recentSessionsData.items || []);
      setUserStats(userData);
      setCurrentSession(activeSessionData);
    } catch (err) {
      console.error("Error loading data:", err);
      setError("Failed to load data. Please check your connection and try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, setCurrentSession]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartScanning = () => {
    if (activeSession) {
      router.push(`/staff/scan?sessionId=${activeSession.id}`);
    } else {
      // Navigate to session creation or show message
      router.push('/supervisor/sessions');
    }
  };

  const handleRefresh = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setRefreshing(true);
    await loadData();
  };

  const handleResumeSession = (sessionId: string) => {
    router.push(`/staff/scan?sessionId=${sessionId}`);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ModernHeader
        title="Staff Dashboard"
        subtitle={`${user?.full_name || user?.username || 'Welcome'} • ${new Date().toLocaleDateString()}`}
        showUsername={false}
        showLogoutButton={true}
        onLogout={logout}
      />
      
      {/* Enhanced Offline Status Indicator */}
      <View style={styles.statusRow}>
        <OfflineStatusIndicator
          isOnline={isOnline}
          queueDepth={queueDepth}
          lastSyncTime={lastSyncTime}
          onRetry={refreshStatus}
          showQueue={true}
          showLastSync={true}
        />
      </View>

      {/* Sync Status Pill */}
      <View style={styles.statusRow}>
        <SyncStatusPill />
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={uiTokens.colors.accent}
            colors={[uiTokens.colors.accent]}
          />
        }
      >
        {/* Error Boundary */}
        {error && (
          <StandardizedErrorCard
            title="Data Loading Failed"
            description={error}
            onPrimaryAction={loadData}
            primaryActionText="Retry"
            errorType={isOnline ? "sync" : "offline"}
          />
        )}

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={uiTokens.colors.accent} />
            <Text style={[styles.loadingText, { color: uiTokens.colors.textSecondary }]}>
              Loading your dashboard...
            </Text>
          </View>
        ) : (
          <>
            {/* Active Session Card */}
            {activeSession ? (
              <ModernCard
                style={[
                  styles.sessionCard,
                  { 
                    backgroundColor: uiTokens.colors.surface,
                    borderColor: uiTokens.colors.border,
                  }
                ]}
              >
                <View style={styles.sessionHeader}>
                  <Ionicons name="cube-outline" size={24} color={uiTokens.colors.accent} />
                  <View style={styles.sessionInfo}>
                    <Text style={[styles.sessionTitle, { color: uiTokens.colors.textPrimary }]}>
                      Active Session
                    </Text>
                    <Text style={[styles.sessionLocation, { color: uiTokens.colors.textSecondary }]}>
                      {activeSession.warehouse || activeSession.location}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.statsRow}>
                  <StatsCard 
                    title="Items Scanned" 
                    value={activeSession.total_items || 0} 
                    icon="checkbox-outline"
                    variant="secondary"
                  />
                  <StatsCard 
                    title="Variance" 
                    value={activeSession.total_variance || 0} 
                    icon="alert-circle-outline"
                    variant={activeSession.total_variance && activeSession.total_variance > 0 ? "warning" : "secondary"}
                  />
                </View>
                
                <ModernButton
                  title="Continue Scanning"
                  onPress={() => handleResumeSession(activeSession.id)}
                  variant="primary"
                  icon="scan-outline"
                  style={styles.continueButton}
                />
              </ModernCard>
            ) : (
              <ModernCard
                style={[
                  styles.noSessionCard,
                  { 
                    backgroundColor: uiTokens.colors.surface,
                    borderColor: uiTokens.colors.border,
                  }
                ]}
              >
                <Ionicons name="cube-outline" size={48} color={uiTokens.colors.textMuted} style={styles.noSessionIcon} />
                <Text style={[styles.noSessionTitle, { color: uiTokens.colors.textPrimary }]}>
                  No Active Session
                </Text>
                <Text style={[styles.noSessionSubtitle, { color: uiTokens.colors.textSecondary }]}>
                  Contact your supervisor to start a new session
                </Text>
                <ModernButton
                  title="Find Available Sessions"
                  onPress={() => router.push('/supervisor/sessions')}
                  variant="secondary"
                  icon="albums-outline"
                  style={styles.findSessionButton}
                />
              </ModernCard>
            )}

            {/* Quick Actions */}
            <ModernCard
              style={[
                styles.quickActionsCard,
                { 
                  backgroundColor: uiTokens.colors.surface,
                  borderColor: uiTokens.colors.border,
                }
              ]}
            >
              <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
                Quick Actions
              </Text>
              
              <View style={styles.quickActionsGrid}>
                <ModernButton
                  title="Start Scan"
                  onPress={handleStartScanning}
                  variant="primary"
                  icon="scan-outline"
                  disabled={!activeSession}
                />
                
                <ModernButton
                  title="My History"
                  onPress={() => router.push('/staff/history')}
                  variant="secondary"
                  icon="time-outline"
                />
                
                <ModernButton
                  title="Settings"
                  onPress={() => router.push('/staff/settings')}
                  variant="tertiary"
                  icon="settings-outline"
                />
                
                <ModernButton
                  title="Help"
                  onPress={() => router.push('/help')}
                  variant="tertiary"
                  icon="help-circle-outline"
                />
              </View>
            </ModernCard>

            {/* Recent Sessions */}
            {recentSessions.length > 0 && (
              <ModernCard
                style={[
                  styles.recentSessionsCard,
                  { 
                    backgroundColor: uiTokens.colors.surface,
                    borderColor: uiTokens.colors.border,
                  }
                ]}
              >
                <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
                  Recent Sessions
                </Text>
                
                <View style={styles.sessionsList}>
                  {recentSessions.map((session, index) => (
                    <View 
                      key={index} 
                      style={[
                        styles.sessionItem,
                        { 
                          backgroundColor: uiTokens.colors.surfaceElevated,
                          borderColor: uiTokens.colors.border,
                        }
                      ]}
                      onTouchStart={() => Platform.OS !== "web" && Haptics.selectionAsync()}
                    >
                      <View style={styles.sessionItemLeft}>
                        <Ionicons name="cube-outline" size={20} color={uiTokens.colors.accent} />
                        <View>
                          <Text style={[styles.sessionItemTitle, { color: uiTokens.colors.textPrimary }]}>
                            {session.warehouse || `Session ${session.id.substring(0, 8)}`}
                          </Text>
                          <Text style={[styles.sessionItemSubtitle, { color: uiTokens.colors.textSecondary }]}>
                            {new Date(session.started_at).toLocaleDateString()} • {session.total_items || 0} items
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.sessionItemRight}>
                        <Text style={[styles.sessionStatus, { color: session.status === 'OPEN' ? uiTokens.colors.success : uiTokens.colors.warning }]}>
                          {session.status}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={uiTokens.colors.textMuted} />
                      </View>
                    </View>
                  ))}
                </View>
                
                <ModernButton
                  title="View All Sessions"
                  onPress={() => router.push('/staff/history')}
                  variant="tertiary"
                  icon="eye-outline"
                  fullWidth
                />
              </ModernCard>
            )}

            {/* User Stats */}
            {userStats && (
              <ModernCard
                style={[
                  styles.statsCard,
                  { 
                    backgroundColor: uiTokens.colors.surface,
                    borderColor: uiTokens.colors.border,
                  }
                ]}
              >
                <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
                  Your Performance
                </Text>
                
                <View style={styles.userStatsRow}>
                  <StatsCard 
                    title="Total Scans" 
                    value={userStats.total_scans || 0} 
                    icon="bar-chart-outline"
                    variant="secondary"
                  />
                  <StatsCard 
                    title="Accuracy" 
                    value={`${userStats.accuracy || 0}%`} 
                    icon="checkmark-circle-outline"
                    variant="success"
                  />
                  <StatsCard 
                    title="Avg Time" 
                    value={`${userStats.avg_time || 0}s`} 
                    icon="time-outline"
                    variant="secondary"
                  />
                </View>
              </ModernCard>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: unifiedSpacing.lg,
    paddingBottom: 100,
  },
  statusRow: {
    marginHorizontal: unifiedSpacing.md,
    marginBottom: unifiedSpacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: unifiedSpacing["2xl"],
  },
  loadingText: {
    marginTop: unifiedSpacing.md,
    textAlign: "center",
  },
  sessionCard: {
    marginBottom: unifiedSpacing.xl,
    padding: unifiedSpacing.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: unifiedSpacing.md,
  },
  sessionInfo: {
    marginLeft: unifiedSpacing.md,
  },
  sessionTitle: {
    ...textStyles.h6,
    fontWeight: "600",
  },
  sessionLocation: {
    ...textStyles.caption,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: unifiedSpacing.lg,
  },
  continueButton: {
    marginTop: unifiedSpacing.md,
  },
  noSessionCard: {
    alignItems: "center",
    padding: unifiedSpacing.xl,
    marginBottom: unifiedSpacing.xl,
  },
  noSessionIcon: {
    marginBottom: unifiedSpacing.md,
  },
  noSessionTitle: {
    ...textStyles.h5,
    fontWeight: "600",
    marginBottom: unifiedSpacing.sm,
  },
  noSessionSubtitle: {
    ...textStyles.body,
    textAlign: "center",
    marginBottom: unifiedSpacing.lg,
  },
  findSessionButton: {
    alignSelf: "stretch",
  },
  quickActionsCard: {
    marginBottom: unifiedSpacing.xl,
    padding: unifiedSpacing.lg,
  },
  sectionTitle: {
    ...textStyles.h6,
    fontWeight: "600",
    marginBottom: unifiedSpacing.md,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: unifiedSpacing.sm,
  },
  recentSessionsCard: {
    marginBottom: unifiedSpacing.xl,
    padding: unifiedSpacing.lg,
  },
  sessionsList: {
    marginBottom: unifiedSpacing.md,
  },
  sessionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: unifiedSpacing.md,
    marginBottom: unifiedSpacing.sm,
    borderRadius: unifiedRadius.md,
    borderWidth: 1,
  },
  sessionItemLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  sessionItemTitle: {
    ...textStyles.caption,
    fontWeight: "500",
  },
  sessionItemSubtitle: {
    ...textStyles.captionSmall,
  },
  sessionItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: unifiedSpacing.xs,
  },
  sessionStatus: {
    ...textStyles.caption,
    fontWeight: "500",
  },
  statsCard: {
    padding: unifiedSpacing.lg,
  },
  userStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export default ImprovedHomeScreen;