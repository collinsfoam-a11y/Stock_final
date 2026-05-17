import React from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeContext } from "../../context/ThemeContext";
import { AuroraBackground } from "./AuroraBackground";
import type { AuroraVariant } from "./AuroraBackground";
import { Stack } from "expo-router";
import { ScreenHeader, ScreenHeaderProps } from "./ScreenHeader";
import { PatternBackground } from "./PatternBackground";
import { SkeletonScreen } from "./SkeletonList";
import { useUiTokens } from "../../hooks/useUiTokens";

export type BackgroundType = "solid" | "aurora" | "pattern";
export type ContentMode = "static" | "scroll";
export type LoadingType = "spinner" | "skeleton";

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: ScreenHeaderProps;
  gradient?: boolean;
  backgroundType?: BackgroundType;
  auroraVariant?: AuroraVariant;
  auroraIntensity?: "low" | "medium" | "high";
  contentMode?: ContentMode;
  loadingType?: LoadingType;
  loadingText?: string;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  scrollable?: boolean;
  headerTitle?: string;
  headerRight?: React.ReactNode;
  headerLeft?: React.ReactNode;
  withParticles?: boolean;
  safeArea?: boolean;
  noPadding?: boolean;
  overlay?: React.ReactNode;
  statusBarStyle?: "light-content" | "dark-content" | "light" | "dark";
  dismissKeyboardOnTap?: boolean;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  style,
  containerStyle,
  contentContainerStyle,
  header,
  gradient = false,
  backgroundType,
  auroraVariant = "primary",
  auroraIntensity = "medium",
  contentMode,
  loadingType = "spinner",
  loadingText,
  loading = false,
  refreshing = false,
  onRefresh,
  scrollable = false,
  headerTitle,
  headerRight,
  headerLeft,
  withParticles = false,
  safeArea = true,
  noPadding = false,
  overlay,
  statusBarStyle,
  dismissKeyboardOnTap = false,
}) => {
  const { themeLegacy: theme } = useThemeContext();
  const uiTokens = useUiTokens();
  const resolvedBackground = backgroundType || (gradient ? "aurora" : "solid");
  const resolvedScrollable = contentMode ? contentMode === "scroll" : scrollable;
  const defaultStatusBarStyle = uiTokens.mode === "dark" ? "light-content" : "dark-content";
  const requestedStatusBarStyle = statusBarStyle ?? defaultStatusBarStyle;
  const resolvedStatusBarStyle: "light-content" | "dark-content" =
    requestedStatusBarStyle === "dark" || requestedStatusBarStyle === "dark-content"
      ? "dark-content"
      : "light-content";
  const isSkeletonLoading = loadingType === "skeleton";

  const Container = resolvedScrollable ? ScrollView : View;
  const containerProps = resolvedScrollable
    ? {
        contentContainerStyle: [
          styles.scrollContent,
          !noPadding && { paddingBottom: theme.layout?.safeArea?.bottom || 34 },
          contentContainerStyle,
        ],
        refreshControl: onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={uiTokens.colors.accent}
            colors={[uiTokens.colors.accent]} // Android
            progressBackgroundColor={uiTokens.colors.surfaceElevated}
          />
        ) : undefined,
        keyboardShouldPersistTaps: "handled" as const,
        keyboardDismissMode: "on-drag" as const,
        bounces: true,
        alwaysBounceVertical: true,
        nestedScrollEnabled: true,
      }
    : {
        style: [styles.content, style],
      };

  const renderContent = () => (
    <>
      <StatusBar barStyle={resolvedStatusBarStyle} />
      {header && <ScreenHeader {...header} transparent={resolvedBackground === "aurora"} />}
      {/* Configure Stack Screen if header props provided */}
      {(headerTitle || headerRight || headerLeft) && (
        <Stack.Screen
          options={{
            headerTitle: headerTitle,
            headerRight: () => headerRight,
            headerLeft: () => headerLeft,
            headerShown: true,
            headerTransparent: resolvedBackground === "aurora",
            headerTintColor: uiTokens.colors.textPrimary,
            headerStyle: {
              backgroundColor:
                resolvedBackground === "aurora" ? "transparent" : uiTokens.colors.background,
            },
          }}
        />
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          {isSkeletonLoading ? (
            <SkeletonScreen />
          ) : (
            <>
              <ActivityIndicator size="large" color={uiTokens.colors.accent} />
              {loadingText ? (
                <Text style={[styles.loadingText, { color: uiTokens.colors.textSecondary }]}>
                  {loadingText}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : resolvedScrollable ? (
        // @ts-ignore
        <Container style={[styles.flex, style]} {...containerProps}>
          {children}
        </Container>
      ) : dismissKeyboardOnTap ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          {/* @ts-ignore */}
          <Container style={[styles.flex, style]} {...containerProps}>
            {children}
          </Container>
        </TouchableWithoutFeedback>
      ) : (
        // Avoid wrapping all static screens with a touchable, which can interfere with
        // nested scroll responders and cause intermittent scroll lockups.
        // @ts-ignore
        <Container style={[styles.flex, style]} {...containerProps}>
          {children}
        </Container>
      )}
      {overlay ? (
        <View style={[StyleSheet.absoluteFill, styles.pointerEventsBoxNone]}>{overlay}</View>
      ) : null}
    </>
  );

  if (resolvedBackground === "aurora") {
    return (
      <AuroraBackground
        variant={auroraVariant}
        intensity={auroraIntensity}
        withParticles={withParticles}
        style={[styles.container, containerStyle]}
      >
        {safeArea ? (
          <SafeAreaView style={styles.safeArea}>{renderContent()}</SafeAreaView>
        ) : (
          renderContent()
        )}
      </AuroraBackground>
    );
  }

  const baseContent = safeArea ? (
    <SafeAreaView style={styles.safeArea}>{renderContent()}</SafeAreaView>
  ) : (
    renderContent()
  );

  if (resolvedBackground === "pattern") {
    return (
      <View
        style={[styles.container, { backgroundColor: uiTokens.colors.background }, containerStyle]}
      >
        <PatternBackground />
        {baseContent}
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: uiTokens.colors.background }, containerStyle]}
    >
      {baseContent}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  pointerEventsBoxNone: {
    pointerEvents: "box-none",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
});
