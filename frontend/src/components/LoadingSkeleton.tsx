import React from "react";
import { useUiTokens } from "@/hooks/useUiTokens";

import { View } from "react-native";
interface SkeletonListProps {
  itemHeight: number;
  count: number;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({ itemHeight, count }) => {
  const uiTokens = useUiTokens();

  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={{
            height: itemHeight,
            backgroundColor: uiTokens.colors.border,
            marginBottom: uiTokens.spacing.sm,
            borderRadius: uiTokens.radius.md,
          }}
        />
      ))}
    </View>
  );
};
