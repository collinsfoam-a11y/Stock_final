import React from "react";
import { TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
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
  color,
}) => {
  const uiTokens = useUiTokens();
  const iconColor = color ?? uiTokens.colors.success;

  return (
    <TouchableOpacity
      style={[styles.button, { opacity: loading ? 0.6 : 1 }]}
      onPress={onRefresh}
      disabled={loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Ionicons name="refresh-outline" size={size} color={iconColor} />
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
