import { logger } from '@/services/logging';
import { useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  checkItemCounted,
  createCountLine,
  addQuantityToCountLine,
} from "../../../../services/api";
import { normalizeSerialValue } from "../../../../utils/scanUtils";
import { Item, CreateCountLinePayload } from "../../../../types/scan";
import { useItemForm } from "./useItemForm";
import { safeBackNavigation } from "@/utils/navigation";

interface UseItemSubmissionProps {
  form: ReturnType<typeof useItemForm>;
  item: Item | null;
  sessionId: string | null;
  sessionType: string | null;
}

const calculateFinalQuantity = (form: ReturnType<typeof useItemForm>): number =>
  form.isBatchMode
    ? form.batches.reduce((sum, batch) => sum + batch.quantity, 0)
    : parseFloat(form.quantity);

const confirmStrictVariance = async (
  sessionType: string | null,
  item: Item,
  enteredQty: number,
): Promise<boolean> => {
  if (sessionType !== "STRICT") return true;
  const currentStock = Number(item.stock_qty || 0);
  if (enteredQty === currentStock) return true;

  return new Promise((resolve) => {
    Alert.alert(
      "Strict Mode Warning",
      `Counted quantity (${enteredQty}) does not match stock quantity (${currentStock}). Are you sure?`,
      [
        { text: "Cancel", onPress: () => resolve(false), style: "cancel" },
        {
          text: "Confirm Variance",
          onPress: () => resolve(true),
          style: "destructive",
        },
      ],
    );
  });
};

const selectDuplicateAction = async (existingQty: number): Promise<"ADD" | "CANCEL" | "NEW"> =>
  new Promise((resolve) => {
    Alert.alert(
      "Item Already Counted",
      `This item has already been counted (Qty: ${existingQty}). Do you want to add to the existing count?`,
      [
        { text: "Cancel", onPress: () => resolve("CANCEL"), style: "cancel" },
        { text: "Add to Existing", onPress: () => resolve("ADD") },
        { text: "Create New Entry", onPress: () => resolve("NEW") },
      ],
    );
  });

const resolveCountLineId = (existingLine: any): string | null => {
  const lineId = existingLine?.id || existingLine?.line_id || existingLine?._id;
  return lineId ? String(lineId) : null;
};

const buildCountLinePayload = (
  form: ReturnType<typeof useItemForm>,
  item: Item,
  sessionId: string,
  finalQty: number,
): CreateCountLinePayload => {
  const payload: CreateCountLinePayload = {
    session_id: sessionId,
    item_code: item.item_code,
    item_name: item.item_name || item.name || item.item_code,
    batch_id: item.batch_id || undefined,
    counted_qty: finalQty,
    batches: form.isBatchMode ? form.batches : undefined,
    damaged_qty: form.isDamageEnabled ? Number(form.damageQty) : 0,
    item_condition: form.condition,
    condition_details: form.condition === "Other" ? form.conditionDetails : undefined,
    remark: form.remark || undefined,
    photo_base64: form.itemPhoto?.base64,
    mrp_counted: form.mrpEditable && form.mrp ? Number(form.mrp) : undefined,
    category_correction: form.categoryEditable ? form.category : undefined,
    subcategory_correction: form.categoryEditable ? form.subCategory : undefined,
    manufacturing_date: form.mfgDate || undefined,
  };

  if (form.isSerialEnabled) {
    payload.serial_numbers = form.serialNumbers.map((sn) => normalizeSerialValue(sn));
  }
  return payload;
};

export const useItemSubmission = ({
  form,
  item,
  sessionId,
  sessionType,
}: UseItemSubmissionProps) => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const returnToScan = () =>
    safeBackNavigation(router, {
      sessionFallbackHref: sessionId ? `/staff/scan?sessionId=${encodeURIComponent(sessionId)}` : undefined,
      userRole: "staff",
    });

  const addToExistingCountLine = async (existingLine: any, finalQty: number) => {
    setLoading(true);
    try {
      const lineId = resolveCountLineId(existingLine);
      if (!lineId) throw new Error("Missing count line id for add-quantity");
      await addQuantityToCountLine(lineId, finalQty, form.isBatchMode ? form.batches : undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Quantity added successfully", [
        { text: "OK", onPress: returnToScan },
      ]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to add quantity";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateCount = async (finalQty: number): Promise<boolean> => {
    try {
      const checkResult = await checkItemCounted(sessionId as string, item!.item_code);
      const existingLine = checkResult.count_lines?.[0];
      if (!checkResult.already_counted || !existingLine) return false;

      const userChoice = await selectDuplicateAction(existingLine.counted_qty);
      if (userChoice === "CANCEL") return true;
      if (userChoice === "ADD") {
        await addToExistingCountLine(existingLine, finalQty);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn("Error checking item counted:", error);
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!form.validateForm(item, sessionType)) return;
    if (!item || !sessionId) return;

    const finalQty = calculateFinalQuantity(form);
    const confirmed = await confirmStrictVariance(sessionType, item, finalQty);
    if (!confirmed) return;

    const handledDuplicate = await handleDuplicateCount(finalQty);
    if (handledDuplicate) return;

    setLoading(true);
    try {
      const payload = buildCountLinePayload(form, item, sessionId as string, finalQty);
      await createCountLine(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Item counted successfully", [
        { text: "OK", onPress: returnToScan },
      ]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit count";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    handleSubmit,
  };
};
