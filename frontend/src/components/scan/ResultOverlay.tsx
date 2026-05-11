import React from "react";
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  colors as uiColors,
  semanticColors as uiSemanticColors,
  shadows as uiShadows,
} from "@/theme/legacyCompat";
interface ResultOverlayProps {
  onClose: () => void;
  onFlip: () => void;
  onCapture: () => void;
  loading?: boolean;
}

export const ResultOverlay: React.FC<ResultOverlayProps> = ({
  onClose,
  onFlip,
  onCapture,
  loading = false,
}) => {
  return (
    <View style={styles.overlay}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.button} onPress={onClose}>
          <Ionicons name="close" size={28} color={uiSemanticColors.text.inverse} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onFlip}>
          <Ionicons name="camera-reverse-outline" size={24} color={uiSemanticColors.text.inverse} />
        </TouchableOpacity>
      </View>
      <View style={styles.shutterBar}>
        <TouchableOpacity style={styles.shutterButton} onPress={onCapture} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={uiColors.neutral[800]} />
          ) : (
            <Ionicons name="radio-button-on" size={64} color={uiColors.neutral[800]} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    padding: 20,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40, // Adjust for status bar
  },
  button: {
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 20,
  },
  shutterBar: {
    alignItems: "center",
    marginBottom: 40,
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: uiSemanticColors.text.inverse,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    ...uiShadows.md,
  },
});
