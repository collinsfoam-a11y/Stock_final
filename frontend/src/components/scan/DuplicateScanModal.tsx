import React from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import ModernButton from "@/components/ui/ModernButton";
import { useUiTokens } from "@/hooks/useUiTokens";

interface DuplicateScanModalProps {
  visible: boolean;
  countedQty: number;
  countedBy: string;
  countedAt?: string;
  onContinue: () => void;
  onViewRecord: () => void;
  onCancel: () => void;
}

export function DuplicateScanModal({
  visible,
  countedQty,
  countedBy,
  countedAt,
  onContinue,
  onViewRecord,
  onCancel,
}: DuplicateScanModalProps) {
  const tokens = useUiTokens();

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.warning }]}>
          <Text style={[styles.title, { color: tokens.colors.warning }]}>⚠ Already Counted</Text>
          <View style={styles.details}>
            <Text style={[styles.text, { color: tokens.colors.textPrimary }]}>
              Count = <Text style={{ fontWeight: "700" }}>{countedQty}</Text>
            </Text>
            <Text style={[styles.text, { color: tokens.colors.textPrimary }]}>Counted by: {countedBy}</Text>
            {countedAt && <Text style={[styles.text, { color: tokens.colors.textSecondary }]}>{countedAt}</Text>}
          </View>

          <View style={styles.actions}>
            <ModernButton title="Continue Count (+)" onPress={onContinue} variant="primary" style={styles.btn} />
            <ModernButton title="View Record" onPress={onViewRecord} variant="outline" style={styles.btn} />
            <ModernButton title="Cancel" onPress={onCancel} variant="ghost" style={styles.btn} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 2,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  details: {
    alignItems: "center",
    gap: 4,
    marginVertical: 12,
  },
  text: {
    fontSize: 16,
  },
  actions: {
    gap: 12,
  },
  btn: {
    width: "100%",
  },
});
