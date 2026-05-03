import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  fontSize,
  fontWeight,
  spacing,
} from "@/theme/unified";

const SURFACE_CARD = "#ffffff";
const SURFACE_BORDER = "#d9e5e2";
const SURFACE_MUTED = "#f8fafc";
const ACCENT = "#0f766e";
const TEXT_STRONG = "#0f172a";

interface OptionSelectModalProps {
  visible: boolean;
  title: string;
  options: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
}

export const OptionSelectModal: React.FC<OptionSelectModalProps> = ({
  visible,
  title,
  options,
  onSelect,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.content}>
          <Text style={styles.kicker}>Select value</Text>
          <Text style={styles.title}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable onPress={() => onSelect(item)} style={styles.option}>
                <View style={styles.optionRow}>
                  <Text style={styles.optionText}>{item}</Text>
                  <Ionicons name="chevron-forward" size={18} color={ACCENT} />
                </View>
              </Pressable>
            )}
          />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    padding: spacing.lg,
  },
  content: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "70%",
    borderRadius: 24,
    backgroundColor: SURFACE_CARD,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    padding: spacing.lg,
  },
  kicker: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: TEXT_STRONG,
    marginBottom: spacing.md,
  },
  option: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    backgroundColor: SURFACE_MUTED,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionText: {
    fontSize: fontSize.md,
    color: TEXT_STRONG,
  },
  closeButton: {
    marginTop: spacing.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
    backgroundColor: SURFACE_MUTED,
  },
  closeButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: ACCENT,
  },
});
