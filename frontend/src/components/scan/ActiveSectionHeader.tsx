import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { OperationalButton } from "../ui/OperationalSurface";
import {
  modernColors,
  modernTypography,
  modernSpacing,
  modernBorderRadius,
} from "../../styles/modernDesignSystem";
import { useScanSessionStore } from "../../store/scanSessionStore";

export const ActiveSectionHeader: React.FC = () => {
  const { currentFloor, currentRack, closeSection } = useScanSessionStore();

  const handleCloseSection = () => {
    Alert.alert(
      "Close Section",
      "Are you sure you want to close this section? You will need to select a new location to continue scanning.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close Section",
          style: "destructive",
          onPress: closeSection,
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.infoContainer}>
          <View style={styles.locationRow}>
            <View style={styles.locationItem}>
              <Ionicons name="layers-outline" size={16} color={modernColors.primary[400]} />
              <Text style={styles.locationLabel}>Floor:</Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {currentFloor}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.locationItem}>
              <Ionicons name="grid-outline" size={16} color={modernColors.primary[400]} />
              <Text style={styles.locationLabel}>Rack:</Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {currentRack}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actionContainer}>
          <OperationalButton
            title="Close"
            onPress={handleCloseSection}
            variant="secondary"
            size="small"
            icon="close-circle-outline"
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: modernSpacing.md,
    zIndex: 100,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: modernSpacing.md,
    paddingVertical: modernSpacing.sm,
    backgroundColor: modernColors.background.paper,
    borderRadius: modernBorderRadius.md,
    borderWidth: 1,
    borderColor: modernColors.border.light,
    overflow: "hidden",
  },
  infoContainer: {
    flex: 1,
    marginRight: modernSpacing.md,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: modernColors.border.light,
    marginHorizontal: modernSpacing.md,
  },
  locationLabel: {
    ...modernTypography.label.medium,
    color: modernColors.text.secondary,
  },
  locationValue: {
    ...modernTypography.body.medium,
    color: modernColors.text.primary,
    fontWeight: "600",
  },
  actionContainer: {
    flexShrink: 0,
  },
});
