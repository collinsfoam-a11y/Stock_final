import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ModernInput } from "@/components/ui/ModernInput";
import {
  WarehouseOption,
  ZoneOption,
} from "@/components/supervisor/dashboard/supervisorDashboardShared";
import { legacyTheme as theme } from "@/theme/unified";

import { semanticColors as uiSemanticColors } from "@/theme/unified";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";

import { AppTouchable } from "@/components/ui/AppTouchable";

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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Session</Text>
              <AppTouchable
                {...getAccessibleButtonProps({ label: "Close modal" })}
                onPress={() => {
                  void haptics.light();
                  onClose();
                }}
                style={styles.modalCloseButton}
                accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={theme.colors.text.primary} {...getDecorativeIconProps()} />
              </AppTouchable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
            >
              <View style={styles.stepContainer}>
                <Text style={styles.stepLabel}>1. Select Location Type</Text>
                <View style={styles.optionsGrid}>
                  {zones.map((zone) => (
                    <AppTouchable
                      key={zone.id}
                      {...getAccessibleButtonProps({
                        label: zone.zone_name,
                        selected: locationType === zone.zone_name,
                      })}
                      style={[
                        styles.optionButton,
                        locationType === zone.zone_name && styles.optionButtonSelected,
                      ]}
                      onPress={() => {
                        void haptics.light();
                        onChangeLocationType(zone.zone_name);
                      }}
 >
                      <Text
                        style={[
                          styles.optionText,
                          locationType === zone.zone_name && styles.optionTextSelected,
                        ]}
                      >
                        {zone.zone_name}
                      </Text>
                    </AppTouchable>
                  ))}
                </View>
              </View>

              {locationType && (
                <View style={styles.stepContainer}>
                  <Text style={styles.stepLabel}>2. Select Floor/Area</Text>
                  {isLoadingWarehouses ? (
                    <ActivityIndicator color={theme.colors.primary[500]} />
                  ) : (
                    <View style={styles.optionsGrid}>
                      {warehouses.map((warehouse) => (
                        <AppTouchable
                          key={warehouse.id}
                          {...getAccessibleButtonProps({
                            label: warehouse.warehouse_name,
                            selected: selectedFloor === warehouse.warehouse_name,
                          })}
                          style={[
                            styles.optionButton,
                            selectedFloor === warehouse.warehouse_name &&
                              styles.optionButtonSelected,
                          ]}
                          onPress={() => {
                            void haptics.light();
                            onChangeSelectedFloor(warehouse.warehouse_name);
                          }}
 >
                          <Text
                            style={[
                              styles.optionText,
                              selectedFloor === warehouse.warehouse_name &&
                                styles.optionTextSelected,
                            ]}
                          >
                            {warehouse.warehouse_name}
                          </Text>
                        </AppTouchable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {selectedFloor && (
                <View style={styles.stepContainer}>
                  <Text style={styles.stepLabel}>3. Rack / Shelf Identifier</Text>
                  <ModernInput
                    value={rackName}
                    onChangeText={onChangeRackName}
                    placeholder="e.g. RACK-A1"
                    icon="grid-outline"
                    autoCapitalize="characters"
                  />
                </View>
              )}

              <AppTouchable
                {...getAccessibleButtonProps({
                  label: "Start Session",
                  disabled: !locationType || !selectedFloor || !rackName.trim() || isCreatingSession,
                  busy: isCreatingSession,
                })}
                style={[
                  styles.createButton,
                  (!locationType || !selectedFloor || !rackName.trim() || isCreatingSession) &&
                    styles.createButtonDisabled,
                ]}
                onPress={() => {
                  void haptics.medium();
                  onSubmit();
                }}
                disabled={!locationType || !selectedFloor || !rackName.trim() || isCreatingSession}
 >
                {isCreatingSession ? (
                  <ActivityIndicator color={uiSemanticColors.text.inverse} />
                ) : (
                  <Text style={styles.createButtonText}>Start Session</Text>
                )}
              </AppTouchable>

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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: theme.colors.background.paper,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  modalCloseButton: {
    padding: theme.spacing.xs,
  },
  stepContainer: {
    marginBottom: theme.spacing.lg,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  optionButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.elevated,
  },
  optionButtonSelected: {
    borderColor: theme.colors.primary[500],
    backgroundColor: theme.colors.primary[500] + "15",
  },
  optionText: {
    color: theme.colors.text.primary,
    fontWeight: "500",
  },
  optionTextSelected: {
    color: theme.colors.primary[500],
    fontWeight: "700",
  },
  createButton: {
    backgroundColor: theme.colors.primary[500],
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "700",
  },
  bottomSpacer: {
    height: 40,
  },
});
