import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { AppTouchable } from '@/components/ui/AppTouchable';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiTokens } from '../../hooks/useUiTokens';
import { colors as unifiedColors, spacing as unifiedSpacing, radius as unifiedRadius, textStyles } from '@/theme/unified';

interface OfflineStatusIndicatorProps {
  isOnline: boolean;
  queueDepth?: number;
  lastSyncTime?: Date;
  onRetry?: () => void;
  showQueue?: boolean;
  showLastSync?: boolean;
}

export const OfflineStatusIndicator: React.FC<OfflineStatusIndicatorProps> = ({
  isOnline,
  queueDepth = 0,
  lastSyncTime,
  onRetry,
  showQueue = true,
  showLastSync = true
}) => {
  const uiTokens = useUiTokens();

  const getStatusInfo = () => {
    if (isOnline) {
      return {
        bgColor: `${uiTokens.colors.success}15`,
        borderColor: uiTokens.colors.success,
        textColor: uiTokens.colors.success,
        icon: 'wifi',
        label: 'Online',
        description: 'Connected to server'
      };
    } else {
      return {
        bgColor: `${uiTokens.colors.warning}15`,
        borderColor: uiTokens.colors.warning,
        textColor: uiTokens.colors.warning,
        icon: 'wifi-outline' as any,
        label: 'Offline',
        description: 'Working in offline mode'
      };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: statusInfo.bgColor,
        borderColor: statusInfo.borderColor,
      }
    ]}>
      <View style={styles.statusRow}>
        <Ionicons name={statusInfo.icon} size={16} color={statusInfo.textColor} />
        <Text style={[styles.statusText, { color: statusInfo.textColor }]}>
          {statusInfo.label}
        </Text>
        
        {!isOnline && onRetry && (
          <AppTouchable style={styles.retryButton} onPress={onRetry}>
            <Ionicons name="refresh" size={14} color={uiTokens.colors.accent} />
            <Text style={[styles.retryText, { color: uiTokens.colors.accent }]}>Retry</Text>
          </AppTouchable>
        )}
      </View>
      
      {(showQueue && queueDepth > 0) && (
        <View style={styles.queueRow}>
          <Ionicons name="time-outline" size={14} color={uiTokens.colors.textSecondary} />
          <Text style={[styles.queueText, { color: uiTokens.colors.textSecondary }]}>
            {queueDepth} pending {queueDepth === 1 ? 'operation' : 'operations'}
          </Text>
        </View>
      )}
      
      {showLastSync && lastSyncTime && (
        <View style={styles.syncRow}>
          <Ionicons name="sync-outline" size={14} color={uiTokens.colors.textSecondary} />
          <Text style={[styles.syncText, { color: uiTokens.colors.textSecondary }]}>
            Last sync: {formatTimeAgo(lastSyncTime)}
          </Text>
        </View>
      )}
    </View>
  );
};

const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: unifiedRadius.sm,
    padding: unifiedSpacing.sm,
    marginHorizontal: unifiedSpacing.md,
    marginVertical: unifiedSpacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: unifiedSpacing.xs,
  },
  statusText: {
    ...textStyles.caption,
    fontWeight: '500',
    marginLeft: unifiedSpacing.xs,
    flex: 1,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${unifiedColors.white}80`,
    paddingHorizontal: unifiedSpacing.sm,
    paddingVertical: unifiedSpacing.xs,
    borderRadius: unifiedRadius.full,
    gap: unifiedSpacing.xs,
  },
  retryText: {
    ...textStyles.caption,
    fontWeight: '500',
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: unifiedSpacing.xs,
  },
  queueText: {
    ...textStyles.caption,
    marginLeft: unifiedSpacing.xs,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncText: {
    ...textStyles.caption,
    marginLeft: unifiedSpacing.xs,
  },
});