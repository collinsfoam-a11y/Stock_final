import React, { useCallback } from "react";
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { SerialEntryData } from "@/types/scan";
import {
  colors,
  fontSize,
  fontWeight,
  semanticColors,
  spacing,
} from "@/theme/unified";
import { SerialEntryCard } from "./SerialEntryCard";

interface SerialEntriesSectionProps {
  serialEntries: SerialEntryData[];
  serialValidationErrors: string[];
  serialValidationMessages: (string | null)[];
  onOpenScanner: () => void;
  onAddSerial: () => void;
  onSerialChange: (index: number, text: string) => void;
  onRemoveSerial: (index: number) => void;
}

export const SerialEntriesSection: React.FC<SerialEntriesSectionProps> = ({
  serialEntries,
  serialValidationErrors,
  serialValidationMessages,
  onOpenScanner,
  onAddSerial,
  onSerialChange,
  onRemoveSerial,
}) => {
  const renderSerialEntry = useCallback(
    ({ item, index }: { item: SerialEntryData; index: number }) => (
      <SerialEntryCard
        entry={item}
        index={index}
        validationError={serialValidationMessages[index]}
        onChangeText={(text) => onSerialChange(index, text)}
        onRemove={() => onRemoveSerial(index)}
      />
    ),
    [onRemoveSerial, onSerialChange, serialValidationMessages]
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="barcode-outline" size={20} color={colors.primary[600]} />
          <Text style={styles.title}>Serial Numbers</Text>
        </View>
        <Text style={styles.helperText}>
          Scan or type serial numbers - quantity auto-updates ({serialEntries.length} scanned)
        </Text>
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={onOpenScanner}>
        <Ionicons name="scan" size={24} color={colors.white} />
        <Text style={styles.scanButtonText}>Scan Serial Numbers</Text>
      </TouchableOpacity>

      {serialValidationErrors.length > 0 && (
        <View style={styles.validationContainer}>
          {serialValidationErrors.map((error, index) => (
            <Text key={`${error}-${index}`} style={styles.validationText}>
              • {error}
            </Text>
          ))}
        </View>
      )}

      <FlatList
        data={serialEntries}
        keyExtractor={(entry) => entry.id}
        renderItem={renderSerialEntry}
        extraData={serialValidationMessages}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled={Platform.OS === "android"}
        scrollEnabled={false}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
      />

      <TouchableOpacity style={styles.addButton} onPress={onAddSerial}>
        <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
        <Text style={styles.addButtonText}>Add Serial Manually</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.md,
  },
  header: {
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    marginLeft: spacing.xs,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: semanticColors.text.primary,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: semanticColors.text.secondary,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.primary[600],
  },
  scanButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semiBold,
    color: colors.white,
  },
  validationContainer: {
    marginTop: spacing.md,
    borderRadius: 14,
    padding: spacing.md,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  validationText: {
    fontSize: fontSize.sm,
    color: colors.error[700],
  },
  list: {
    marginTop: spacing.md,
  },
  listContent: {
    gap: spacing.sm,
  },
  addButton: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  addButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
    color: colors.primary[600],
  },
});
