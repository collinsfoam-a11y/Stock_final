# Senior UI/UX Engineering Strategy Implementation
## Stock Verification Application

### Executive Summary

This document outlines the implementation plan for the comprehensive UI/UX engineering strategy, focusing on migrating to the new `core/` and `features/` architecture while building a robust design system infrastructure. The implementation balances the need for immediate UI improvements with the long-term goal of sustainable, scalable architecture.

### Phase 0: Infrastructure Setup (Weeks -2 to 0)

#### 0.1 Design System Foundation
```
core/
  design-system/
    tokens/
      colors.ts          # Semantic palette (not literal names)
      spacing.ts         # 4px base grid
      typography.ts      # Font stacks, scales, weights
      motion.ts          # Duration, easing curves
      elevation.ts       # Shadow + z-index pairs
      breakpoints.ts     # Container query-first breakpoints
    themes/
      light.ts
      dark.ts
      high-contrast.ts   # Accessibility requirement
    transformers/
      to-css-variables.ts
      to-tailwind-config.ts
```

**Implementation Steps:**
```typescript
// core/design-system/tokens/colors.ts
export const semanticColors = {
  surface: {
    primary: {
      DEFAULT: 'hsl(0, 0%, 100%)',
      muted: 'hsl(0, 0%, 98%)',
      subtle: 'hsl(0, 0%, 95%)',
      emphasis: 'hsl(0, 0%, 10%)',
      disabled: 'hsl(0, 0%, 90%)',
    },
    secondary: {
      DEFAULT: 'hsl(220, 14%, 96%)',
      muted: 'hsl(220, 12%, 90%)',
      subtle: 'hsl(220, 10%, 85%)',
      emphasis: 'hsl(220, 8%, 15%)',
      disabled: 'hsl(220, 10%, 80%)',
    },
    danger: {
      DEFAULT: 'hsl(0, 85%, 60%)',
      muted: 'hsl(0, 75%, 70%)',
      subtle: 'hsl(0, 65%, 85%)',
      emphasis: 'hsl(0, 95%, 30%)',
      disabled: 'hsl(0, 50%, 80%)',
    },
    success: {
      DEFAULT: 'hsl(120, 65%, 45%)',
      muted: 'hsl(120, 55%, 60%)',
      subtle: 'hsl(120, 45%, 85%)',
      emphasis: 'hsl(120, 75%, 25%)',
      disabled: 'hsl(120, 40%, 80%)',
    },
  },
  border: {
    DEFAULT: 'hsl(210, 15%, 85%)',
    subtle: 'hsl(210, 10%, 90%)',
    emphasis: 'hsl(210, 20%, 65%)',
    disabled: 'hsl(210, 10%, 80%)',
  },
  text: {
    primary: 'hsl(220, 8%, 15%)',
    secondary: 'hsl(220, 6%, 40%)',
    subtle: 'hsl(220, 4%, 60%)',
    disabled: 'hsl(220, 4%, 75%)',
    inverse: 'hsl(0, 0%, 100%)',
    danger: 'hsl(0, 90%, 45%)',
    success: 'hsl(120, 70%, 35%)',
  },
} as const;

export type SemanticColorKeys = keyof typeof semanticColors;
```

```typescript
// core/design-system/tokens/spacing.ts
export const spacing = {
  xxs: '0.125rem', // 2px
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.25rem',   // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem',   // 32px
  '4xl': '2.5rem', // 40px
  '5xl': '3rem',   // 48px
  '6xl': '4rem',   // 64px
  '7xl': '5rem',   // 80px
  '8xl': '6rem',   // 96px
} as const;

export type SpacingKeys = keyof typeof spacing;
```

#### 0.2 Token Transformer Implementation
```typescript
// core/design-system/transformers/to-css-variables.ts
import { semanticColors } from '../tokens/colors';
import { spacing } from '../tokens/spacing';
import { typography } from '../tokens/typography';

export function generateCssVariables() {
  const cssVars: Record<string, string> = {};

  // Generate color variables
  Object.entries(semanticColors).forEach(([colorCategory, colorVariants]) => {
    if (typeof colorVariants === 'string') {
      cssVars[`--color-${colorCategory}`] = colorVariants;
    } else {
      Object.entries(colorVariants).forEach(([variant, value]) => {
        cssVars[`--color-${colorCategory}-${variant}`] = value;
      });
    }
  });

  // Generate spacing variables
  Object.entries(spacing).forEach(([size, value]) => {
    cssVars[`--spacing-${size}`] = value;
  });

  // Generate typography variables
  Object.entries(typography.size).forEach(([scale, value]) => {
    cssVars[`--text-size-${scale}`] = value.fontSize;
    cssVars[`--text-line-height-${scale}`] = value.lineHeight;
  });

  return cssVars;
}
```

#### 0.3 API Contract Abstraction Layer
```
api/
  client.ts           # Axios/fetch instance with interceptors
  adapters/
    session.adapter.ts    # Maps backend DTO → frontend model
    error.adapter.ts      # Normalizes backend errors → UIError
  types/
    session.types.ts      # Frontend model (source of truth)
```

```typescript
// api/client.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || '/api',
  timeout: 10000,
});

// Request interceptor to add auth headers
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle common error patterns
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log errors for monitoring
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);
```

```typescript
// api/adapters/error.adapter.ts
export interface UIError {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: Date;
  action?: string;
  actionLabel?: string;
}

export function normalizeError(error: any): UIError {
  // Normalize different error types from backend
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;
    
    if (status >= 500) {
      return {
        code: 'SERVER_ERROR',
        message: 'Service temporarily unavailable. Please try again.',
        severity: 'critical',
        timestamp: new Date(),
      };
    }
    
    if (status === 401) {
      return {
        code: 'UNAUTHORIZED',
        message: 'Session expired. Please sign in again.',
        severity: 'critical',
        timestamp: new Date(),
        action: 'REAUTHENTICATE',
        actionLabel: 'Sign In',
      };
    }
    
    if (status === 403) {
      return {
        code: 'FORBIDDEN',
        message: 'Access denied. Contact your administrator.',
        severity: 'error',
        timestamp: new Date(),
      };
    }
    
    // Generic error with detail from server
    return {
      code: `HTTP_${status}`,
      message: data.detail || 'An error occurred. Please try again.',
      severity: 'error',
      timestamp: new Date(),
    };
  }
  
  if (error.request) {
    // Request made but no response
    return {
      code: 'NETWORK_ERROR',
      message: 'Network connection lost. Working offline...',
      severity: 'warning',
      timestamp: new Date(),
    };
  }
  
  // Other errors
  return {
    code: 'CLIENT_ERROR',
    message: error.message || 'An unexpected error occurred',
    severity: 'error',
    timestamp: new Date(),
  };
}
```

#### 0.4 Feature Flag Infrastructure
```typescript
// core/feature-flags/feature-flags.ts
export type FeatureFlag =
  | 'ui-redesign-dashboard'
  | 'ui-redesign-verification'
  | 'ui-redesign-dark-mode'
  | 'barcode-scanning-enhanced'
  | 'bulk-operations'
  | 'advanced-search'
  | 'offline-sync-enhanced';

export interface FeatureFlags {
  [key: string]: boolean;
}

export class FeatureFlagService {
  private flags: FeatureFlags;
  
  constructor() {
    // Load from environment, local storage, or remote config
    this.flags = this.loadFlags();
  }
  
  private loadFlags(): FeatureFlags {
    const envFlags = this.loadFromEnvironment();
    const storedFlags = this.loadFromLocalStorage();
    
    return {
      ...envFlags,
      ...storedFlags,
    };
  }
  
  private loadFromEnvironment(): FeatureFlags {
    return {
      'ui-redesign-dashboard': process.env.EXPO_PUBLIC_FEATURE_REDUX_DASHBOARD === 'true',
      'ui-redesign-verification': process.env.EXPO_PUBLIC_FEATURE_REDUX_VERIFICATION === 'true',
      'ui-redesign-dark-mode': process.env.EXPO_PUBLIC_FEATURE_DARK_MODE === 'true',
      'barcode-scanning-enhanced': process.env.EXPO_PUBLIC_FEATURE_BARCODE_SCANNING === 'true',
      'bulk-operations': process.env.EXPO_PUBLIC_FEATURE_BULK_OPERATIONS === 'true',
      'advanced-search': process.env.EXPO_PUBLIC_FEATURE_ADVANCED_SEARCH === 'true',
      'offline-sync-enhanced': process.env.EXPO_PUBLIC_FEATURE_OFFLINE_SYNC === 'true',
    };
  }
  
  private loadFromLocalStorage(): FeatureFlags {
    try {
      const stored = localStorage.getItem('feature-flags');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }
  
  isEnabled(flag: FeatureFlag): boolean {
    return this.flags[flag] ?? false;
  }
  
  setFlag(flag: FeatureFlag, enabled: boolean): void {
    this.flags[flag] = enabled;
    localStorage.setItem('feature-flags', JSON.stringify(this.flags));
  }
  
  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }
}

export const featureFlagService = new FeatureFlagService();
```

### Phase 1: Core UI Primitives (Weeks 1-4)

#### 1.1 Button Component Implementation
```tsx
// core/ui/button/button.tsx
import React from 'react';
import { TouchableOpacity, Text, View, ActivityIndicator } from 'react-native';
import { styled } from 'nativewind';
import { semanticColors } from '@/core/design-system/tokens/colors';
import { spacing } from '@/core/design-system/tokens/spacing';
import { typography } from '@/core/design-system/tokens/typography';

const StyledTouchableOpacity = styled(TouchableOpacity);
const StyledText = styled(Text);
const StyledView = styled(View);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles = {
  primary: {
    bg: semanticColors.surface.primary.emphasis,
    text: semanticColors.text.inverse,
    border: 'transparent',
    hover: semanticColors.surface.primary.emphasis,
    active: semanticColors.surface.primary.emphasis,
    disabled: semanticColors.surface.primary.disabled,
  },
  secondary: {
    bg: semanticColors.surface.secondary.DEFAULT,
    text: semanticColors.text.primary,
    border: semanticColors.border.DEFAULT,
    hover: semanticColors.surface.secondary.muted,
    active: semanticColors.surface.secondary.subtle,
    disabled: semanticColors.surface.secondary.muted,
  },
  ghost: {
    bg: 'transparent',
    text: semanticColors.text.primary,
    border: 'transparent',
    hover: semanticColors.surface.secondary.muted,
    active: semanticColors.surface.secondary.subtle,
    disabled: semanticColors.text.disabled,
  },
  danger: {
    bg: semanticColors.surface.danger.DEFAULT,
    text: semanticColors.text.inverse,
    border: 'transparent',
    hover: semanticColors.surface.danger.emphasis,
    active: semanticColors.surface.danger.emphasis,
    disabled: semanticColors.surface.danger.muted,
  },
  success: {
    bg: semanticColors.surface.success.DEFAULT,
    text: semanticColors.text.inverse,
    border: 'transparent',
    hover: semanticColors.surface.success.emphasis,
    active: semanticColors.surface.success.emphasis,
    disabled: semanticColors.surface.success.muted,
  },
};

const sizeStyles = {
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.sm.fontSize,
    lineHeight: typography.size.sm.lineHeight,
  },
  md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.size.base.fontSize,
    lineHeight: typography.size.base.lineHeight,
  },
  lg: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    fontSize: typography.size.lg.fontSize,
    lineHeight: typography.size.lg.lineHeight,
  },
};

export const Button: React.FC<ButtonProps> = ({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  icon,
  fullWidth = false,
}) => {
  const variantStyle = variantStyles[variant];
  const sizeStyle = sizeStyles[size];
  
  const buttonStyle = [
    'rounded-lg',
    'flex-row',
    'items-center',
    'justify-center',
    'border',
    fullWidth ? 'w-full' : 'w-auto',
    `py-[${sizeStyle.paddingVertical}]`,
    `px-[${sizeStyle.paddingHorizontal}]`,
    `border-[${variantStyle.border}]`,
    `bg-[${disabled ? variantStyle.disabled : variantStyle.bg}]`,
    disabled ? 'opacity-70' : 'opacity-100',
    className,
  ];

  const textStyle = [
    `text-[${disabled ? (variant === 'ghost' ? semanticColors.text.disabled : variantStyle.text) : variantStyle.text}]`,
    `text-[${sizeStyle.fontSize}]`,
    `leading-[${sizeStyle.lineHeight}]`,
    'font-medium',
  ];

  return (
    <StyledTouchableOpacity
      className={buttonStyle.join(' ')}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <>
          <ActivityIndicator 
            size="small" 
            color={variant === 'primary' || variant === 'danger' || variant === 'success' 
              ? semanticColors.text.inverse 
              : semanticColors.text.primary} 
            className="mr-2"
          />
          <StyledText className={textStyle.join(' ')}>
            Loading...
          </StyledText>
        </>
      ) : (
        <>
          {icon && <View className="mr-2">{icon}</View>}
          <StyledText className={textStyle.join(' ')}>
            {children}
          </StyledText>
        </>
      )}
    </StyledTouchableOpacity>
  );
};
```

#### 1.2 Input Component Implementation
```tsx
// core/ui/input/input.tsx
import React, { useState, forwardRef } from 'react';
import { TextInput, View, Text } from 'react-native';
import { styled } from 'nativewind';
import { semanticColors } from '@/core/design-system/tokens/colors';
import { spacing } from '@/core/design-system/tokens/spacing';
import { typography } from '@/core/design-system/tokens/typography';

const StyledTextInput = styled(TextInput);
const StyledView = styled(View);
const StyledText = styled(Text);

export type InputVariant = 'default' | 'error' | 'success';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  variant?: InputVariant;
  error?: string;
  helperText?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  multiline?: boolean;
  numberOfLines?: number;
  className?: string;
  disabled?: boolean;
}

const variantStyles = {
  default: {
    bg: semanticColors.surface.primary.DEFAULT,
    border: semanticColors.border.DEFAULT,
    text: semanticColors.text.primary,
    placeholder: semanticColors.text.subtle,
  },
  error: {
    bg: semanticColors.surface.danger.subtle,
    border: semanticColors.surface.danger.emphasis,
    text: semanticColors.text.danger,
    placeholder: semanticColors.text.subtle,
  },
  success: {
    bg: semanticColors.surface.success.subtle,
    border: semanticColors.surface.success.emphasis,
    text: semanticColors.text.success,
    placeholder: semanticColors.text.subtle,
  },
};

export const Input = forwardRef<any, InputProps>(({
  label,
  placeholder,
  value,
  onChangeText,
  variant = 'default',
  error,
  helperText,
  secureTextEntry = false,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  className = '',
  disabled = false,
}, ref) => {
  const variantStyle = variantStyles[variant];
  const [isFocused, setIsFocused] = useState(false);

  const containerStyle = [
    'rounded-lg',
    'border',
    `border-[${variantStyle.border}]`,
    `bg-[${variantStyle.bg}]`,
    'overflow-hidden',
    disabled ? 'opacity-70' : 'opacity-100',
    className,
  ];

  const inputStyle = [
    'py-3',
    'px-4',
    `text-[${variantStyle.text}]`,
    `text-[${typography.size.base.fontSize}]`,
    `leading-[${typography.size.base.lineHeight}]`,
    'placeholder:text-[${variantStyle.placeholder}]',
    'flex-1',
    'font-normal',
  ];

  return (
    <StyledView className="w-full">
      {label && (
        <StyledText className={`
          text-[${semanticColors.text.secondary}]
          text-[${typography.size.sm.fontSize}]
          leading-[${typography.size.sm.lineHeight}]
          mb-2
          font-medium
        `}>
          {label}
        </StyledText>
      )}
      
      <StyledView className={containerStyle.join(' ')}>
        <StyledTextInput
          ref={ref}
          className={inputStyle.join(' ')}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={!disabled}
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
        />
      </StyledView>
      
      {(helperText || error) && (
        <StyledText className={`
          mt-2
          text-[${error ? semanticColors.text.danger : semanticColors.text.subtle}]
          text-[${typography.size.sm.fontSize}]
          leading-[${typography.size.sm.lineHeight}]
          ${error ? 'font-medium' : 'font-normal'}
        `}>
          {error || helperText}
        </StyledText>
      )}
    </StyledView>
  );
});
```

#### 1.3 Theme Provider Implementation
```tsx
// core/theme/theme-provider.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, StyleSheet } from 'react-native';
import { generateCssVariables } from '@/core/design-system/transformers/to-css-variables';

interface ThemeContextType {
  theme: 'light' | 'dark' | 'high-contrast';
  setTheme: (theme: 'light' | 'dark' | 'high-contrast') => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'high-contrast'>('light');
  
  useEffect(() => {
    // Initialize theme based on system preference
    const colorScheme = Appearance.getColorScheme();
    setTheme(colorScheme === 'dark' ? 'dark' : 'light');
    
    // Listen for theme changes
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setTheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    
    return () => subscription.remove();
  }, []);
  
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };
  
  const isDark = theme === 'dark' || (theme === 'system' && Appearance.getColorScheme() === 'dark');
  
  // Apply CSS variables to the root
  useEffect(() => {
    const cssVars = generateCssVariables();
    Object.entries(cssVars).forEach(([property, value]) => {
      document.documentElement.style.setProperty(property, value);
    });
  }, [theme]);
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
```

### Phase 2: Feature Integration (Weeks 5-8)

#### 2.1 Verification Feature Structure
```
features/
  verification/
    pages/
      SessionListPage.tsx
      SessionDetailPage.tsx
    widgets/
      StockItemScanner.tsx      # Barcode integration
      DiscrepancyAlert.tsx      # Domain-specific alert
      BulkActionsToolbar.tsx
    api/
      useSessions.ts            # TanStack Query hooks
      useUpdateStockCount.ts    # Mutation with optimistic update
    hooks/
      useScanner.ts             # Barcode scanner abstraction
```

#### 2.2 Session List Page Implementation
```tsx
// features/verification/pages/SessionListPage.tsx
import React from 'react';
import { View, FlatList, Text, RefreshControl } from 'react-native';
import { styled } from 'nativewind';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/core/ui/button/button';
import { Input } from '@/core/ui/input/input';
import { useSessions } from '../api/useSessions';
import { SessionCard } from '../widgets/SessionCard';

const StyledView = styled(View);
const StyledText = styled(Text);
const StyledFlatList = styled(FlatList);

export const SessionListPage: React.FC = () => {
  const { 
    data: sessions, 
    isLoading, 
    isError, 
    refetch,
    isRefetching 
  } = useSessions();

  const [searchQuery, setSearchQuery] = React.useState('');

  if (isError) {
    return (
      <StyledView className="flex-1 justify-center items-center p-4">
        <StyledText className="text-red-500 text-lg mb-4">Failed to load sessions</StyledText>
        <Button onPress={() => refetch()}>Retry</Button>
      </StyledView>
    );
  }

  return (
    <StyledView className="flex-1 bg-white p-4">
      <StyledText className="text-2xl font-bold text-gray-800 mb-4">Verification Sessions</StyledText>
      
      <Input
        label="Search Sessions"
        placeholder="Enter session ID or location..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        className="mb-4"
      />
      
      <StyledFlatList
        data={sessions}
        renderItem={({ item }) => <SessionCard session={item} />}
        keyExtractor={(item) => item.id.toString()}
        refreshing={isRefetching}
        onRefresh={refetch}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <StyledView className="flex-1 justify-center items-center py-10">
            <StyledText className="text-gray-500 text-lg">No sessions found</StyledText>
          </StyledView>
        }
      />
      
      <Button 
        className="mt-4"
        onPress={() => {
          // Navigate to create session
        }}
      >
        Start New Session
      </Button>
    </StyledView>
  );
};
```

#### 2.3 API Hooks with Contract Abstraction
```tsx
// features/verification/api/useSessions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { normalizeError } from '@/api/adapters/error.adapter';
import { Session } from '@/api/types/session.types';

const SESSIONS_QUERY_KEY = ['sessions'];

export const useSessions = (filters?: { status?: string; location?: string }) => {
  return useQuery({
    queryKey: [...SESSIONS_QUERY_KEY, filters],
    queryFn: async (): Promise<Session[]> => {
      try {
        const response = await apiClient.get('/sessions', { 
          params: filters 
        });
        return response.data;
      } catch (error) {
        const normalizedError = normalizeError(error);
        throw new Error(normalizedError.message);
      }
    },
    staleTime: 30_000,        // 30s before refetch
    gcTime: 5 * 60_000,       // 5m cache retention
    retry: 2,
  });
};

export const useCreateSession = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (sessionData: Partial<Session>) => {
      try {
        const response = await apiClient.post('/sessions', sessionData);
        return response.data;
      } catch (error) {
        const normalizedError = normalizeError(error);
        throw new Error(normalizedError.message);
      }
    },
    onSuccess: (newSession) => {
      // Optimistically update the cache
      queryClient.setQueryData(SESSIONS_QUERY_KEY, (old: Session[] = []) => [
        newSession,
        ...old,
      ]);
    },
  });
};

export const useUpdateSession = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Session> }) => {
      try {
        const response = await apiClient.patch(`/sessions/${id}`, updates);
        return response.data;
      } catch (error) {
        const normalizedError = normalizeError(error);
        throw new Error(normalizedError.message);
      }
    },
    onSuccess: (updatedSession) => {
      // Update the specific session in cache
      queryClient.setQueryData(SESSIONS_QUERY_KEY, (old: Session[] = []) => 
        old.map(session => session.id === updatedSession.id ? updatedSession : session)
      );
    },
  });
};
```

### Phase 3: Advanced Features (Weeks 9-12)

#### 3.1 Barcode Scanner Hook
```tsx
// features/verification/hooks/useScanner.ts
import { useState, useEffect, useRef } from 'react';

export interface ScannerResult {
  code: string;
  type: string;
  timestamp: Date;
}

export const useScanner = (onScan: (result: ScannerResult) => void) => {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScannerResult | null>(null);
  const scanBuffer = useRef<string>('');
  const scanTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isScanning) return;

      // Clear timeout on each keypress
      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
      }

      // Handle Enter key (common scanner termination)
      if (e.key === 'Enter') {
        if (scanBuffer.current.length > 3) { // Basic validation
          const result: ScannerResult = {
            code: scanBuffer.current,
            type: 'unknown', // Would be determined by actual scanner
            timestamp: new Date(),
          };
          
          setLastScan(result);
          onScan(result);
          scanBuffer.current = '';
        }
        return;
      }

      // Ignore modifier keys
      if (e.key.length === 1) {
        scanBuffer.current += e.key;
      }

      // Set timeout to handle non-enter terminated scans
      scanTimeout.current = setTimeout(() => {
        if (scanBuffer.current.length > 3) {
          const result: ScannerResult = {
            code: scanBuffer.current,
            type: 'unknown',
            timestamp: new Date(),
          };
          
          setLastScan(result);
          onScan(result);
          scanBuffer.current = '';
        }
      }, 100); // 100ms timeout for scanner input
    };

    if (isScanning) {
      document.addEventListener('keypress', handleKeyPress);
    }

    return () => {
      document.removeEventListener('keypress', handleKeyPress);
      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
      }
    };
  }, [isScanning, onScan]);

  const startScanning = () => {
    setIsScanning(true);
    scanBuffer.current = '';
  };

  const stopScanning = () => {
    setIsScanning(false);
    if (scanTimeout.current) {
      clearTimeout(scanTimeout.current);
    }
    scanBuffer.current = '';
  };

  return {
    isScanning,
    startScanning,
    stopScanning,
    lastScan,
  };
};
```

#### 3.2 Offline-First Service Worker Integration
```typescript
// core/offline/offline-manager.ts
import { QueryClient } from '@tanstack/react-query';

export class OfflineManager {
  private queryClient: QueryClient;
  private isOnline: boolean = navigator.onLine;
  private pendingMutations: Array<{
    key: string;
    data: any;
    timestamp: number;
  }> = [];

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.setupNetworkListeners();
    this.loadPendingMutations();
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processPendingMutations();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private async loadPendingMutations() {
    try {
      const stored = await this.getStoredValue('pending_mutations');
      if (stored) {
        this.pendingMutations = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load pending mutations:', error);
    }
  }

  private async savePendingMutations() {
    try {
      await this.setStoredValue('pending_mutations', JSON.stringify(this.pendingMutations));
    } catch (error) {
      console.error('Failed to save pending mutations:', error);
    }
  }

  private async getStoredValue(key: string): Promise<string | null> {
    // Use IndexedDB or localStorage depending on data size
    return localStorage.getItem(key);
  }

  private async setStoredValue(key: string, value: string) {
    localStorage.setItem(key, value);
  }

  async queueMutation<T>(mutationKey: string, data: T): Promise<void> {
    const mutation = {
      key: mutationKey,
      data,
      timestamp: Date.now(),
    };

    this.pendingMutations.push(mutation);
    await this.savePendingMutations();

    // If online, try to sync immediately
    if (this.isOnline) {
      await this.processPendingMutations();
    }
  }

  private async processPendingMutations(): Promise<void> {
    if (!this.isOnline || this.pendingMutations.length === 0) {
      return;
    }

    const mutationsToProcess = [...this.pendingMutations];
    this.pendingMutations = [];

    for (const mutation of mutationsToProcess) {
      try {
        // Attempt to sync the mutation
        await this.syncMutation(mutation);
      } catch (error) {
        // If sync fails, add back to queue
        this.pendingMutations.push(mutation);
      }
    }

    await this.savePendingMutations();
  }

  private async syncMutation(mutation: any): Promise<void> {
    // Implementation would depend on your API structure
    // This is a simplified example
    console.log(`Syncing mutation: ${mutation.key}`);
  }

  getOfflineStatus(): boolean {
    return !this.isOnline;
  }

  getPendingCount(): number {
    return this.pendingMutations.length;
  }
}
```

### Phase 4: Quality Assurance & Performance (Weeks 13-16)

#### 4.1 Accessibility Testing Setup
```typescript
// core/testing/a11y-test-utils.ts
import { render } from '@testing-library/react-native';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

export const renderWithA11y = (component: React.ReactElement) => {
  const rendered = render(component);
  
  const runAxe = async () => {
    const results = await axe(rendered.toJSON());
    return results;
  };
  
  return {
    ...rendered,
    runAxe,
  };
};

export const testA11y = async (component: React.ReactElement) => {
  const { runAxe } = renderWithA11y(component);
  const results = await runAxe();
  
  expect(results).toHaveNoViolations();
};
```

#### 4.2 Performance Monitoring Hook
```typescript
// core/performance/performance-hooks.ts
import { useEffect, useRef } from 'react';

export const usePerformanceMonitor = (componentName: string) => {
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    startTime.current = performance.now();
    
    return () => {
      if (startTime.current !== null) {
        const renderTime = performance.now() - startTime.current;
        
        // Log performance metrics
        if (renderTime > 100) { // More than 100ms is concerning
          console.warn(`Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`);
        }
        
        // Send to monitoring service
        // monitoringService.trackRenderTime(componentName, renderTime);
      }
    };
  }, [componentName]);
};

export const useMemoryMonitor = (componentName: string) => {
  useEffect(() => {
    const interval = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
          console.warn(`High memory usage in ${componentName}: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [componentName]);
};
```

### Implementation Success Metrics

#### Technical Metrics
- **Bundle Size Reduction**: Achieve 60% reduction through tree-shaking and code splitting
- **Performance Scores**: Maintain 95+ Lighthouse scores across all categories
- **Test Coverage**: Achieve 80%+ coverage for UI logic
- **Accessibility Compliance**: 0 violations in automated testing

#### Product Metrics
- **Task Completion Time**: 30% reduction in session verification time
- **Error Rate**: 50% reduction in user-initiated errors
- **User Satisfaction**: Maintain 4.5/5+ rating during transition

### Risk Mitigation Strategies

1. **Backend API Changes**: Contract abstraction layer insulates UI from backend churn
2. **Performance Regression**: Performance budgets enforced in CI pipeline
3. **User Adoption**: Gradual rollout with feature flags and feedback mechanisms
4. **Offline Capability**: Enhanced offline-first architecture preserves existing functionality

This implementation plan provides a structured approach to executing the senior UI/UX engineering strategy while maintaining the architectural discipline required for long-term sustainability.