import React from "react";
import { TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors as uiColors } from "@/theme/legacyCompat";
import { getAccessibleButtonProps, getDecorativeIconProps, MIN_TOUCH_TARGET } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";
interface RefreshButtonProps {
  onRefresh: () => void;
  loading?: boolean;
  size?: number;
  color?: string;
}

export const RefreshButton: React.FC<RefreshButtonProps> = ({
  onRefresh,
  loading = false,
  size = 24,
  color = uiColors.success[500],
}) => {
  const handlePress = () => {
    void haptics.light();
    onRefresh();
  };

  return (
    <TouchableOpacity
      style={[styles.button, { opacity: loading ? 0.6 : 1, minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET }]}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.7}
      {...getAccessibleButtonProps({
        label: "Refresh",
        disabled: loading,
        busy: loading,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name="refresh-outline" size={size} color={color} {...getDecorativeIconProps()} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
