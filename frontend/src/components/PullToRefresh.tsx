import React from "react";
import { ScrollView, RefreshControl } from "react-native";

import { colors as uiColors } from "@/theme/unified";
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
  return (
    <ScrollView
      style={style}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[uiColors.success[500]]} // Android
          tintColor={uiColors.success[500]} // iOS
        />
      }
    >
      {children}
    </ScrollView>
  );
};
