import React from "react";
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { GlassCard } from "@/components/ui/GlassCard";
import { DateRangePicker } from "@/components/forms/DateRangePicker";
import { auroraTheme } from "@/theme/auroraTheme";

interface DashboardReportModalProps {
  generating: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReportDateRangeChange: (next: { end: Date; start: Date }) => void;
  onReportFormatChange: (format: "excel" | "csv" | "json") => void;
  reportDateRange: { end: Date; start: Date };
  reportFormat: "excel" | "csv" | "json";
  selectedReport: string | null;
  styles: any;
  visible: boolean;
}

export function DashboardReportModal({
  generating,
  onClose,
  onConfirm,
  onReportDateRangeChange,
  onReportFormatChange,
  reportDateRange,
  reportFormat,
  selectedReport,
  styles,
  visible,
}: DashboardReportModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.modalOverlay}>
        <GlassCard variant="strong" style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Generate Report</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons
                name="close"
                size={24}
                color={auroraTheme.colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalLabel}>Date Range</Text>
            <DateRangePicker
              startDate={reportDateRange.start}
              endDate={reportDateRange.end}
              onStartDateChange={(start) =>
                onReportDateRangeChange({ ...reportDateRange, start })
              }
              onEndDateChange={(end) =>
                onReportDateRangeChange({ ...reportDateRange, end })
              }
            />

            <Text style={styles.modalLabel}>Format</Text>
            <View style={styles.formatOptions}>
              {([
                ["excel", "grid-outline", "Excel"],
                ["csv", "document-text-outline", "CSV"],
                ["json", "code-outline", "JSON"],
              ] as const).map(([format, icon, label]) => (
                <TouchableOpacity
                  key={format}
                  style={[
                    styles.formatOption,
                    reportFormat === format && styles.formatOptionActive,
                  ]}
                  onPress={() => onReportFormatChange(format)}
                >
                  <Ionicons
                    name={icon}
                    size={20}
                    color={
                      reportFormat === format
                        ? "#FFF"
                        : auroraTheme.colors.text.secondary
                    }
                  />
                  <Text
                    style={[
                      styles.formatText,
                      reportFormat !== format && {
                        color: auroraTheme.colors.text.secondary,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.modalFooter}>
            <AnimatedPressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.confirmButton}
              onPress={onConfirm}
              disabled={generating || !selectedReport}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Download</Text>
              )}
            </AnimatedPressable>
          </View>
        </GlassCard>
      </BlurView>
    </Modal>
  );
}
