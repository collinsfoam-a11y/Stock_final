/**
 * Date Range Picker Component
 * Fully functional date range selection for reports and analytics
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
  label?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label,
}) => {
  const tokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <View style={styles.container}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowStartPicker(true)}
        >
          <Ionicons
            name="calendar"
            size={20}
            color={tokens.colors.accent}
          />
          <View style={styles.dateContent}>
            <Text style={styles.dateLabel}>Start Date</Text>
            <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
          </View>
        </TouchableOpacity>

        <Ionicons
          name="arrow-forward"
          size={20}
          color={tokens.colors.textSecondary}
        />

        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowEndPicker(true)}
        >
          <Ionicons
            name="calendar"
            size={20}
            color={tokens.colors.accent}
          />
          <View style={styles.dateContent}>
            <Text style={styles.dateLabel}>End Date</Text>
            <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowStartPicker(Platform.OS === "ios");
            if (selectedDate && event.type !== "dismissed") {
              onStartDateChange(selectedDate);
            }
          }}
          maximumDate={endDate}
        />
      )}

      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, selectedDate) => {
            setShowEndPicker(Platform.OS === "ios");
            if (selectedDate && event.type !== "dismissed") {
              onEndDateChange(selectedDate);
            }
          }}
          minimumDate={startDate}
          maximumDate={new Date()}
        />
      )}
    </View>
  );
};

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      marginVertical: gap.md,
    },
    label: {
      fontSize: font.size.base,
      fontWeight: font.weight.bold,
      color: tokens.colors.textPrimary,
      marginBottom: gap.sm,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: gap.md,
    },
    dateButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: gap.sm,
      padding: gap.md,
      backgroundColor: tokens.colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    dateContent: {
      flex: 1,
    },
    dateLabel: {
      fontSize: font.size.sm,
      color: tokens.colors.textSecondary,
      marginBottom: gap.xs,
    },
    dateValue: {
      fontSize: font.size.base,
      color: tokens.colors.textPrimary,
      fontWeight: font.weight.bold,
    },
  });
