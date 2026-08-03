import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTouchable } from '@/components/ui/AppTouchable';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useUiTokens } from '../../hooks/useUiTokens';
import { colors as unifiedColors, spacing as unifiedSpacing, radius as unifiedRadius, textStyles } from '@/theme/unified';

interface StandardizedErrorCardProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  primaryActionText?: string;
  onPrimaryAction?: () => void;
  onDismiss?: () => void;
  errorType?: 'duplicate' | 'serial' | 'projection' | 'sync' | 'session' | 'permission' | 'offline' | 'general';
}

export const StandardizedErrorCard: React.FC<StandardizedErrorCardProps> = ({
  icon = 'alert-circle',
  title,
  description,
  primaryActionText = 'Try Again',
  onPrimaryAction,
  onDismiss,
  errorType = 'general'
}) => {
  const uiTokens = useUiTokens();

  // Determine colors based on error type
  const getErrorColors = () => {
    switch (errorType) {
      case 'duplicate':
      case 'serial':
        return { 
          bg: `${uiTokens.colors.error}15`, 
          border: uiTokens.colors.error,
          icon: uiTokens.colors.error,
          text: uiTokens.colors.textPrimary
        };
      case 'projection':
      case 'sync':
        return { 
          bg: `${uiTokens.colors.warning}15`, 
          border: uiTokens.colors.warning,
          icon: uiTokens.colors.warning,
          text: uiTokens.colors.textPrimary
        };
      case 'offline':
        return { 
          bg: `${uiTokens.colors.accent}15`, 
          border: uiTokens.colors.accent,
          icon: uiTokens.colors.accent,
          text: uiTokens.colors.textPrimary
        };
      default:
        return { 
          bg: `${uiTokens.colors.error}15`, 
          border: uiTokens.colors.error,
          icon: uiTokens.colors.error,
          text: uiTokens.colors.textPrimary
        };
    }
  };

  const colors = getErrorColors();

  return (
    <View style={[
      styles.container, 
      { 
        backgroundColor: colors.bg,
        borderColor: colors.border,
      }
    ]}>
      <View style={styles.header}>
        <Ionicons name={icon} size={24} color={colors.icon} style={styles.icon} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {onDismiss && (
          <AppTouchable onPress={onDismiss} style={styles.dismissButton}>
            <Ionicons name="close" size={18} color={colors.text} />
          </AppTouchable>
        )}
      </View>
      
      <Text style={[styles.description, { color: colors.text }]}>{description}</Text>
      
      <View style={styles.actions}>
        {onPrimaryAction && (
          <AppTouchable 
            style={[
              styles.primaryButton, 
              { 
                backgroundColor: colors.icon,
              }
            ]} 
            onPress={onPrimaryAction}
          >
            <Text style={styles.primaryButtonText}>{primaryActionText}</Text>
          </AppTouchable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: unifiedRadius.md,
    padding: unifiedSpacing.md,
    marginVertical: unifiedSpacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: unifiedSpacing.sm,
  },
  icon: {
    marginRight: unifiedSpacing.sm,
  },
  title: {
    ...textStyles.h6,
    flex: 1,
    fontWeight: '600',
  },
  description: {
    ...textStyles.body,
    marginBottom: unifiedSpacing.md,
    lineHeight: 20,
  },
  dismissButton: {
    padding: unifiedSpacing.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  primaryButton: {
    paddingHorizontal: unifiedSpacing.md,
    paddingVertical: unifiedSpacing.sm,
    borderRadius: unifiedRadius.sm,
  },
  primaryButtonText: {
    color: unifiedColors.white,
    fontWeight: '500',
    fontSize: 14,
  },
});