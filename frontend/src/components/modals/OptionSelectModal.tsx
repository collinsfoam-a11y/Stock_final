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
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";

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
          <Text style={styles.title}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable onPress={() => onSelect(item)} style={styles.option}>
                <Text style={styles.optionText}>{item}</Text>
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
    borderRadius: borderRadius.lg,
    backgroundColor: semanticColors.background.paper,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: semanticColors.text.primary,
    marginBottom: spacing.md,
  },
  option: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticColors.border.default,
  },
  optionText: {
    fontSize: fontSize.md,
    color: semanticColors.text.primary,
  },
  closeButton: {
    marginTop: spacing.md,
    alignSelf: "flex-end",
  },
  closeButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: colors.primary[600],
  },
});
