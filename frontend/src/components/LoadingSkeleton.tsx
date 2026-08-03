import React from "react";
import { semanticColors as uiSemanticColors } from "@/theme/unified";

import { View } from "react-native";
interface SkeletonListProps {
  itemHeight: number;
  count: number;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({ itemHeight, count }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={{
            height: itemHeight,
            backgroundColor: uiSemanticColors.border.default,
            marginBottom: 8,
            borderRadius: 8,
          }}
        />
      ))}
    </View>
  );
};
