import React from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  colors,
  fontSize,
  fontWeight,
  radius as borderRadius,
  semanticColors,
  spacing,
} from "@/theme/unified";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps } from "@/utils/accessibility";

interface OptionSelectModalProps {
  visible: boolean;
  title: string;
  options: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
  selectedValue?: string;
  testID?: string;
}

export const OptionSelectModal: React.FC<OptionSelectModalProps> = ({
  visible,
  title,
  options,
  onSelect,
  onClose,
  selectedValue,
  testID = "option-select-modal",
}) => {
  const handleClose = () => {
    void haptics.light();
    onClose();
  };

  const handleSelectOption = (item: string) => {
    void haptics.light();
    onSelect(item);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          testID={`${testID}-backdrop`}
          accessibilityLabel="Dismiss modal backdrop"
          accessibilityRole="button"
        />
        <View style={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              const isSelected = selectedValue === item;
              return (
                <Pressable
                  onPress={() => handleSelectOption(item)}
                  style={styles.option}
                  testID={`${testID}-option-${item}`}
                  {...getAccessibleButtonProps({
                    label: item,
                    selected: isSelected,
                  })}
                >
                  <Text style={[styles.optionText, isSelected && styles.selectedOptionText]}>
                    {item}
                  </Text>
                </Pressable>
              );
            }}
          />
          <AppTouchable
            style={styles.closeButton}
            onPress={handleClose}
            testID={`${testID}-close`}
            {...getAccessibleButtonProps({ label: "Close" })}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </AppTouchable>
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
    zIndex: 1,
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
  selectedOptionText: {
    fontWeight: fontWeight.bold,
    color: colors.primary[600],
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
