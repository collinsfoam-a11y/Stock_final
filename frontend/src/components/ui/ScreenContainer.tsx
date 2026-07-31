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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { ScreenHeader, ScreenHeaderProps } from "./ScreenHeader";
import { SkeletonScreen } from "./SkeletonList";
import { useUiTokens } from "../../hooks/useUiTokens";

export type ContentMode = "static" | "scroll";
export type LoadingType = "spinner" | "skeleton";

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: ScreenHeaderProps;
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
  safeArea = true,
  noPadding = false,
  overlay,
  statusBarStyle,
  dismissKeyboardOnTap = false,
}) => {
  const uiTokens = useUiTokens();
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
          !noPadding && { paddingBottom: 34 },
          contentContainerStyle,
        ],
        refreshControl: onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={uiTokens.colors.accent}
            colors={[uiTokens.colors.accent]}
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
      {header && <ScreenHeader {...header} transparent={false} />}
      {(headerTitle || headerRight || headerLeft) && (
        <Stack.Screen
          options={{
            headerTitle: headerTitle,
            headerRight: () => headerRight,
            headerLeft: () => headerLeft,
            headerShown: true,
            headerTintColor: uiTokens.colors.textPrimary,
            headerStyle: {
              backgroundColor: uiTokens.colors.background,
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
        <Container style={[styles.flex, style]} {...containerProps}>
          {children}
        </Container>
      ) : dismissKeyboardOnTap ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <Container style={[styles.flex, style]} {...containerProps}>
            {children}
          </Container>
        </TouchableWithoutFeedback>
      ) : (
        <Container style={[styles.flex, style]} {...containerProps}>
          {children}
        </Container>
      )}
      {overlay ? (
        <View style={[StyleSheet.absoluteFill, styles.pointerEventsBoxNone]}>{overlay}</View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: uiTokens.colors.background }, containerStyle]}>
      {safeArea ? <SafeAreaView style={styles.safeArea}>{renderContent()}</SafeAreaView> : renderContent()}
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
