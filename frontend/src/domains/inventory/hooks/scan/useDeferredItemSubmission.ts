import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";

import { createCountLine } from "@/services/api/api";
import { toastService } from "@/services/utils/toastService";
import {
  CreateCountLinePayload,
  DateFormatType,
  Item,
  SerialEntryData,
} from "@/types/scan";
import { normalizeSerialValue } from "@/utils/scanUtils";
import {
  formatBackendValidationDetail,
  toBackendPhotoProofs,
} from "./submissionPayload";

type DamageType = "returnable" | "nonreturnable";

interface UseDeferredItemSubmissionParams {
  barcode?: string;
  sessionId?: string;
  currentFloor?: string | null;
  currentRack?: string | null;
  item: Item | null;
  quantity: string;
  condition: string;
  remark: string;
  isDamageEnabled: boolean;
  damageQty: string;
  damageType: DamageType;
  damagePhoto: string | null;
  itemPhotos: string[];
  isSerializedItem: boolean;
  serialEntries: SerialEntryData[];
  serialNumbers: string[];
  serialValidationErrors: string[];
  validateSerials: () => boolean;
  varianceRemark: string;
  mrp: string;
  hasMfgDate: boolean;
  itemMfgDate: string;
  itemMfgDateFormat: DateFormatType;
  hasExpiryDate: boolean;
  itemExpiryDate: string;
  itemExpiryDateFormat: DateFormatType;
  onSuccess: () => void;
  countdownSeconds?: number;
}

export { toBackendPhotoProofs } from "./submissionPayload";

export const useDeferredItemSubmission = ({
  barcode,
  sessionId,
  currentFloor,
  currentRack,
  item,
  quantity,
  condition,
  remark,
  isDamageEnabled,
  damageQty,
  damageType,
  damagePhoto,
  itemPhotos,
  isSerializedItem,
  serialEntries,
  serialNumbers,
  serialValidationErrors,
  validateSerials,
  varianceRemark,
  mrp,
  hasMfgDate,
  itemMfgDate,
  itemMfgDateFormat,
  hasExpiryDate,
  itemExpiryDate,
  itemExpiryDateFormat,
  onSuccess,
  countdownSeconds = 5,
}: UseDeferredItemSubmissionParams) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitCountdown, setSubmitCountdown] = useState<number | null>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateBeforeSubmit = useCallback(() => {
    if (!item || !sessionId) return false;

    const qty = parseFloat(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity");
      return false;
    }

    const hasSerials = serialEntries.some(
      (entry) => entry.serial_number.trim().length > 0,
    );
    if (isSerializedItem && hasSerials && !validateSerials()) {
      const errorDetails =
        serialValidationErrors.length > 0
          ? ` ${serialValidationErrors.join(", ")}`
          : "";
      Alert.alert(
        "Serial Number Error",
        `Please enter valid serial numbers.${errorDetails}`,
      );
      return false;
    }

    if (isDamageEnabled) {
      const parsedDamageQty = parseFloat(damageQty);
      if (Number.isNaN(parsedDamageQty) || parsedDamageQty <= 0) {
        Alert.alert(
          "Invalid Damage Quantity",
          "Please enter a valid damage quantity",
        );
        return false;
      }

      if (!damagePhoto) {
        Alert.alert(
          "Photo Required",
          "Mandatory photo proof is required for all damage reports. Please capture a photo of the damaged item.",
        );
        return false;
      }
    }

    return true;
  }, [
    damagePhoto,
    damageQty,
    isDamageEnabled,
    isSerializedItem,
    item,
    quantity,
    serialEntries,
    serialValidationErrors,
    sessionId,
    validateSerials,
  ]);

  const executeSubmit = useCallback(async () => {
    if (!item || !sessionId) return;

    setSubmitCountdown(null);
    setSubmitting(true);

    const qty = parseFloat(quantity);

    try {
      const validSerials = isSerializedItem
        ? serialNumbers
            .filter((serial) => serial.trim().length > 0)
            .map(normalizeSerialValue)
        : [];

      const serialEntriesData = isSerializedItem
        ? serialEntries
            .filter((entry) => entry.serial_number.trim().length > 0)
            .map((entry) => ({
              serial_number: normalizeSerialValue(entry.serial_number),
              mrp: entry.mrp,
              manufacturing_date: entry.manufacturing_date,
              mfg_date_format: entry.mfg_date_format,
              expiry_date: entry.expiry_date,
              expiry_date_format: entry.expiry_date_format,
            }))
        : [];

      const nowIso = new Date().toISOString();
      const backendPhotoProofs = toBackendPhotoProofs(
        [
          ...(damagePhoto ? [damagePhoto] : []),
          ...itemPhotos,
        ],
        nowIso,
      );

      const payload: CreateCountLinePayload = {
        session_id: sessionId,
        item_code: item.item_code || barcode || "",
        item_name: item.item_name || item.name || item.item_code || barcode || "",
        counted_qty: qty,
        floor_no: currentFloor || "Unknown",
        rack_no: currentRack || "Unknown",
        item_condition: condition,
        remark,
        damage_included: isDamageEnabled,
        damaged_qty:
          isDamageEnabled && damageType === "returnable"
            ? parseFloat(damageQty)
            : 0,
        non_returnable_damaged_qty:
          isDamageEnabled && damageType === "nonreturnable"
            ? parseFloat(damageQty)
            : 0,
        serial_numbers: validSerials,
        serial_entries:
          serialEntriesData.length > 0 ? serialEntriesData : undefined,
        variance_note: varianceRemark,
        variance_reason: varianceRemark,
        mrp_counted: parseFloat(mrp) || item.mrp || 0,
        manufacturing_date:
          hasMfgDate && itemMfgDate ? itemMfgDate : item.manufacturing_date,
        mfg_date_format: hasMfgDate ? itemMfgDateFormat : undefined,
        expiry_date:
          hasExpiryDate && itemExpiryDate ? itemExpiryDate : item.expiry_date,
        expiry_date_format: hasExpiryDate ? itemExpiryDateFormat : undefined,
        photo_proofs: backendPhotoProofs.length > 0 ? backendPhotoProofs : undefined,
      };

      const result = await createCountLine(payload);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (result.is_misplaced) {
        Alert.alert(
          "Misplaced Item",
          "This item is not expected at this location. It has been flagged for review.",
          [{ text: "OK", onPress: onSuccess }],
        );
        return;
      }

      toastService.show("Item verified successfully", { type: "success" });
      onSuccess();
    } catch (error: any) {
      if (error.response?.status === 409) {
        Alert.alert(
          "Duplicate Scan",
          "This item has already been scanned at this location in this session.",
        );
      } else if (error.response?.status === 423) {
        toastService.show(
          "Item is being processed by another user. Please try again.",
          { type: "warning" },
        );
      } else if (error.response?.status === 422) {
        const detailMessage = formatBackendValidationDetail(
          error.response?.data?.detail,
        );
        Alert.alert(
          "Validation Error",
          detailMessage || "Submitted data format was rejected by server.",
        );
      } else {
        Alert.alert("Error", error.message || "Failed to save count");
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    barcode,
    condition,
    currentFloor,
    currentRack,
    damagePhoto,
    damageQty,
    damageType,
    hasExpiryDate,
    hasMfgDate,
    isDamageEnabled,
    isSerializedItem,
    item,
    itemExpiryDate,
    itemExpiryDateFormat,
    itemMfgDate,
    itemMfgDateFormat,
    itemPhotos,
    mrp,
    onSuccess,
    quantity,
    remark,
    serialEntries,
    serialNumbers,
    sessionId,
    varianceRemark,
  ]);

  useEffect(() => {
    if (submitCountdown === null) return;

    if (submitCountdown > 0) {
      submitTimerRef.current = setTimeout(() => {
        setSubmitCountdown((previous) =>
          previous !== null ? previous - 1 : null,
        );
      }, 1000);
      return () => {
        if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
      };
    }

    void executeSubmit();

    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, [executeSubmit, submitCountdown]);

  const handleSubmitPress = useCallback(() => {
    if (!validateBeforeSubmit()) return;
    setSubmitCountdown(countdownSeconds);
  }, [countdownSeconds, validateBeforeSubmit]);

  const cancelSubmit = useCallback(() => {
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    setSubmitCountdown(null);
  }, []);

  return {
    submitting,
    submitCountdown,
    handleSubmitPress,
    cancelSubmit,
  };
};
