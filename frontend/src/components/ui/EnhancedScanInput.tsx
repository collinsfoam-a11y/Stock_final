import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { AppTouchable } from '@/components/ui/AppTouchable';
import { useUiTokens } from '../../hooks/useUiTokens';
import { colors as unifiedColors, spacing as unifiedSpacing, radius as unifiedRadius, textStyles } from '@/theme/unified';

interface EnhancedScanInputProps {
  onScan: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showCameraButton?: boolean;
  onCameraPress?: () => void;
  onClear?: () => void;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  disabled?: boolean;
  showHapticFeedback?: boolean;
  scanHistory?: string[];
  title?: string;
  subtitle?: string;
}

export const EnhancedScanInput: React.FC<EnhancedScanInputProps> = ({
  onScan,
  placeholder = 'Scan or enter item code...',
  autoFocus = true,
  showCameraButton = true,
  onCameraPress,
  onClear,
  keyboardType = 'default',
  disabled = false,
  showHapticFeedback = true,
  scanHistory = [],
  title,
  subtitle,
}) => {
  const uiTokens = useUiTokens();
  const [inputValue, setInputValue] = useState('');
  const [recentScans, setRecentScans] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      if (showHapticFeedback && Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onScan(inputValue.trim());
      addToRecentScans(inputValue.trim());
      setInputValue('');
    }
  };

  const addToRecentScans = (value: string) => {
    setRecentScans(prev => [value, ...prev.filter(scan => scan !== value)].slice(0, 5));
  };

  const handleClear = () => {
    setInputValue('');
    if (onClear) onClear();
  };

  const handleRecentScanPress = (value: string) => {
    setInputValue(value);
    if (showHapticFeedback && Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {title && <Text style={[styles.title, { color: uiTokens.colors.textPrimary }]}>{title}</Text>}
      {subtitle && <Text style={[styles.subtitle, { color: uiTokens.colors.textSecondary }]}>{subtitle}</Text>}
      
      <View style={[
        styles.inputContainer,
        {
          backgroundColor: uiTokens.colors.surface,
          borderColor: uiTokens.colors.border,
        }
      ]}>
        <TextInput
          ref={inputRef}
          value={inputValue}
          onChangeText={handleInputChange}
          onSubmitEditing={handleSubmit}
          placeholder={placeholder}
          placeholderTextColor={uiTokens.colors.textMuted}
          style={[
            styles.input,
            {
              color: uiTokens.colors.textPrimary,
            }
          ]}
          autoFocus={autoFocus}
          keyboardType={keyboardType}
          editable={!disabled}
          selectTextOnFocus={!disabled}
        />
        
        {inputValue.length > 0 && (
          <AppTouchable onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={uiTokens.colors.textMuted} />
          </AppTouchable>
        )}
        
        {showCameraButton && (
          <AppTouchable 
            onPress={onCameraPress} 
            style={styles.cameraButton}
            disabled={disabled}
          >
            <Ionicons name="camera-outline" size={24} color={uiTokens.colors.accent} />
          </AppTouchable>
        )}
        
        <AppTouchable 
          onPress={handleSubmit} 
          style={[
            styles.scanButton,
            {
              backgroundColor: inputValue ? uiTokens.colors.accent : `${uiTokens.colors.accent}50`,
            }
          ]}
          disabled={!inputValue || disabled}
        >
          <Ionicons name="scan-outline" size={24} color={unifiedColors.white} />
        </AppTouchable>
      </View>
      
      {recentScans.length > 0 && (
        <View style={styles.historyContainer}>
          <Text style={[styles.historyTitle, { color: uiTokens.colors.textSecondary }]}>
            Recent Scans
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historyList}>
            {recentScans.map((scan, index) => (
              <AppTouchable
                key={index}
                style={[
                  styles.historyItem,
                  {
                    backgroundColor: uiTokens.colors.surfaceElevated,
                    borderColor: uiTokens.colors.border,
                  }
                ]}
                onPress={() => handleRecentScanPress(scan)}
              >
                <Text style={[styles.historyText, { color: uiTokens.colors.textPrimary }]}>
                  {scan.length > 15 ? `${scan.substring(0, 15)}...` : scan}
                </Text>
              </AppTouchable>
            ))}
          </ScrollView>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: unifiedSpacing.md,
  },
  title: {
    ...textStyles.h5,
    fontWeight: '600',
    marginBottom: unifiedSpacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...textStyles.body,
    textAlign: 'center',
    marginBottom: unifiedSpacing.md,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: unifiedRadius.lg,
    paddingHorizontal: unifiedSpacing.sm,
    paddingVertical: unifiedSpacing.xs,
    minHeight: 56,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    paddingHorizontal: unifiedSpacing.sm,
  },
  clearButton: {
    padding: unifiedSpacing.xs,
    marginRight: unifiedSpacing.xs,
  },
  cameraButton: {
    padding: unifiedSpacing.sm,
    marginRight: unifiedSpacing.xs,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: unifiedRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyContainer: {
    marginTop: unifiedSpacing.md,
  },
  historyTitle: {
    ...textStyles.caption,
    fontWeight: '500',
    marginBottom: unifiedSpacing.sm,
  },
  historyList: {
    flexDirection: 'row',
    gap: unifiedSpacing.sm,
  },
  historyItem: {
    paddingHorizontal: unifiedSpacing.md,
    paddingVertical: unifiedSpacing.sm,
    borderRadius: unifiedRadius.full,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  historyText: {
    ...textStyles.caption,
    fontWeight: '500',
  },
});