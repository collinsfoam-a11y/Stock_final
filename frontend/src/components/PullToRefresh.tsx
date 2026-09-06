import React from "react";
import { ScrollView, RefreshControl } from "react-native";

import { colors as uiColors } from "@/theme/unified";
import { haptics } from "@/services/haptics";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
  children: React.ReactNode;
  style?: any;
  accessibilityLabel?: string;
  testID?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  refreshing,
  children,
  style,
  accessibilityLabel = "Pull to refresh",
  testID,
}) => {
  const handleRefresh = React.useCallback(() => {
    void haptics.light();
    return onRefresh();
  }, [onRefresh]);

  return (
    <ScrollView
      style={style}
      testID={testID}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[uiColors.success[500]]} // Android
          tintColor={uiColors.success[500]} // iOS
          accessibilityLabel={accessibilityLabel}
        />
      }
    >
      {children}
    </ScrollView>
  );
};
