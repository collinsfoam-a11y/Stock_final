import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernInput from "@/components/ui/ModernInput";
import {
  WarehouseOption,
  ZoneOption,
} from "@/components/supervisor/dashboard/supervisorDashboardShared";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

import { semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
interface CreateSessionModalProps {
  isCreatingSession: boolean;
  isLoadingWarehouses: boolean;
  locationType: string | null;
  onChangeLocationType: (value: string) => void;
  onChangeRackName: (value: string) => void;
  onChangeSelectedFloor: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  rackName: string;
  selectedFloor: string | null;
  visible: boolean;
  warehouses: WarehouseOption[];
  zones: ZoneOption[];
}

export function CreateSessionModal({
  isCreatingSession,
  isLoadingWarehouses,
  locationType,
  onChangeLocationType,
  onChangeRackName,
  onChangeSelectedFloor,
  onClose,
  onSubmit,
  rackName,
  selectedFloor,
  visible,
  warehouses,
  zones,
}: CreateSessionModalProps) {
  const uiTokens = useUiTokens();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { backgroundColor: uiTokens.colors.overlay }]}>
        <Pressable
          style={styles.modalBackdrop}
           hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close create session dialog"
        />
        <View style={styles.modalSheet}>
          <View style={[styles.modalContent, { backgroundColor: uiTokens.colors.surfaceElevated }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: uiTokens.colors.textPrimary }]}>
                Create New Session
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={uiTokens.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
            >
              <View style={styles.stepContainer}>
                <Text style={[styles.stepLabel, { color: uiTokens.colors.textPrimary }]}>
                  1. Select Location Type
                </Text>
                <View style={styles.optionsGrid}>
                  {zones.map((zone) => {
                    const isSelected = locationType === zone.zone_name;
                    return (
                      <TouchableOpacity
                        key={zone.id}
                        style={[
                          styles.optionButton,
                          {
                            borderColor: isSelected ? uiTokens.colors.accent : uiTokens.colors.border,
                            backgroundColor: isSelected
                              ? colorWithAlpha(uiTokens.colors.accent, 0.08)
                              : uiTokens.colors.surface,
                          },
                        ]}
                         hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onChangeLocationType(zone.zone_name)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Location type ${zone.zone_name}`}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            { color: isSelected ? uiTokens.colors.accent : uiTokens.colors.textPrimary },
                            isSelected && styles.optionTextSelected,
                          ]}
                        >
                          {zone.zone_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {locationType && (
                <View style={styles.stepContainer}>
                  <Text style={[styles.stepLabel, { color: uiTokens.colors.textPrimary }]}>
                    2. Select Floor/Area
                  </Text>
                  {isLoadingWarehouses ? (
                    <ActivityIndicator color={uiTokens.colors.accent} />
                  ) : (
                    <View style={styles.optionsGrid}>
                      {warehouses.map((warehouse) => {
                        const isSelected = selectedFloor === warehouse.warehouse_name;
                        return (
                          <TouchableOpacity
                            key={warehouse.id}
                            style={[
                              styles.optionButton,
                              {
                                borderColor: isSelected
                                  ? uiTokens.colors.accent
                                  : uiTokens.colors.border,
                                backgroundColor: isSelected
                                  ? colorWithAlpha(uiTokens.colors.accent, 0.08)
                                  : uiTokens.colors.surface,
                              },
                            ]}
                             hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={() => onChangeSelectedFloor(warehouse.warehouse_name)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            accessibilityLabel={`Floor or area ${warehouse.warehouse_name}`}
                          >
                            <Text
                              style={[
                                styles.optionText,
                                {
                                  color: isSelected
                                    ? uiTokens.colors.accent
                                    : uiTokens.colors.textPrimary,
                                },
                                isSelected && styles.optionTextSelected,
                              ]}
                            >
                              {warehouse.warehouse_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {selectedFloor && (
                <View style={styles.stepContainer}>
                  <Text style={[styles.stepLabel, { color: uiTokens.colors.textPrimary }]}>
                    3. Rack / Shelf Identifier
                  </Text>
                  <ModernInput
                    value={rackName}
                    onChangeText={onChangeRackName}
                    placeholder="e.g. RACK-A1"
                    icon="grid-outline"
                    autoCapitalize="characters"
                  />
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.createButton,
                  { backgroundColor: uiTokens.colors.accent },
                  (!locationType || !selectedFloor || !rackName.trim() || isCreatingSession) &&
                    styles.createButtonDisabled,
                ]}
                 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}onPress={onSubmit}
                disabled={!locationType || !selectedFloor || !rackName.trim() || isCreatingSession}
                accessibilityRole="button"
                accessibilityLabel="Start session"
                accessibilityState={{
                  disabled:
                    !locationType || !selectedFloor || !rackName.trim() || isCreatingSession,
                  busy: isCreatingSession,
                }}
              >
                {isCreatingSession ? (
                  <ActivityIndicator color={uiSemanticColors.text.inverse} />
                ) : (
                  <Text style={styles.createButtonText}>Start Session</Text>
                )}
              </TouchableOpacity>

              <View style={styles.bottomSpacer} />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: gap.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: gap.lg,
  },
  modalTitle: {
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
  },
  modalCloseButton: {
    padding: gap.xs,
  },
  stepContainer: {
    marginBottom: gap.lg,
  },
  stepLabel: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    marginBottom: gap.sm,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: gap.sm,
  },
  optionButton: {
    paddingHorizontal: gap.md,
    paddingVertical: gap.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  optionText: {
    fontWeight: font.weight.medium,
  },
  optionTextSelected: {
    fontWeight: font.weight.bold,
  },
  createButton: {
    padding: gap.md,
    borderRadius: radius.lg,
    alignItems: "center",
    marginTop: gap.md,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: uiSemanticColors.text.inverse,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
  },
  bottomSpacer: {
    height: 40,
  },
});
