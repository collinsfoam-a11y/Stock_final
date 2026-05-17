import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  isLoading = false,
}) => {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const handlePrevious = () => {
    if (currentPage > 1 && !isLoading) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages && !isLoading) {
      onPageChange(currentPage + 1);
    }
  };

  const handleFirst = () => {
    if (currentPage > 1 && !isLoading) {
      onPageChange(1);
    }
  };

  const handleLast = () => {
    if (currentPage < totalPages && !isLoading) {
      onPageChange(totalPages);
    }
  };

  if (totalPages <= 1) {
    return (
      <View style={styles.container}>
        <Text style={styles.infoText}>
          Showing {totalItems} {totalItems === 1 ? "item" : "items"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.infoText}>
        Showing {startItem}-{endItem} of {totalItems} items
      </Text>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, (currentPage === 1 || isLoading) && styles.buttonDisabled]}
          onPress={handleFirst}
          disabled={currentPage === 1 || isLoading}
        >
          <Text
            style={[
              styles.buttonText,
              (currentPage === 1 || isLoading) && styles.buttonTextDisabled,
            ]}
          >
            ««
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, (currentPage === 1 || isLoading) && styles.buttonDisabled]}
          onPress={handlePrevious}
          disabled={currentPage === 1 || isLoading}
        >
          <Text
            style={[
              styles.buttonText,
              (currentPage === 1 || isLoading) && styles.buttonTextDisabled,
            ]}
          >
            «
          </Text>
        </TouchableOpacity>

        <View style={styles.pageInfo}>
          <Text style={styles.pageText}>
            Page {currentPage} of {totalPages}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            (currentPage === totalPages || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={currentPage === totalPages || isLoading}
        >
          <Text
            style={[
              styles.buttonText,
              (currentPage === totalPages || isLoading) && styles.buttonTextDisabled,
            ]}
          >
            »
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            (currentPage === totalPages || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleLast}
          disabled={currentPage === totalPages || isLoading}
        >
          <Text
            style={[
              styles.buttonText,
              (currentPage === totalPages || isLoading) && styles.buttonTextDisabled,
            ]}
          >
            »»
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: uiColors.neutral[50],
    borderTopWidth: 1,
    borderTopColor: uiSemanticColors.border.default,
  },
  infoText: {
    fontSize: 14,
    color: uiSemanticColors.text.secondary,
    marginBottom: 8,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: uiColors.info[500],
    borderRadius: 4,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: uiColors.neutral[300],
    opacity: 0.6,
  },
  buttonText: {
    color: uiSemanticColors.text.inverse,
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonTextDisabled: {
    color: uiSemanticColors.text.tertiary,
  },
  pageInfo: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: uiSemanticColors.text.inverse,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: uiColors.neutral[300],
    minWidth: 100,
    alignItems: "center",
  },
  pageText: {
    fontSize: 14,
    color: uiSemanticColors.text.primary,
    fontWeight: "500",
  },
});
