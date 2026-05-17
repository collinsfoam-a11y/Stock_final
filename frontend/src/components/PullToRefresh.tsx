import React from "react";
import { ScrollView, RefreshControl } from "react-native";

import { useUiTokens } from "@/hooks/useUiTokens";
interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
  children: React.ReactNode;
  style?: any;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  refreshing,
  children,
  style,
}) => {
  const uiTokens = useUiTokens();

  return (
    <ScrollView
      style={style}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[uiTokens.colors.success]} // Android
          tintColor={uiTokens.colors.success} // iOS
        />
      }
    >
      {children}
    </ScrollView>
  );
};
