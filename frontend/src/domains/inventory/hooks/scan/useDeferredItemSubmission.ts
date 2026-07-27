import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { haptics } from "@/services/haptics";

import { createCountLine } from "@/services/api/api";
import { toastService } from "@/services/toastService";
import { CreateCountLinePayload, DateFormatType, Item, SerialEntryData } from "@/types/scan";
import { normalizeSerialValue } from "@/utils/scanUtils";
import { toBackendPhotoProofs } from "./submissionPayload";
import { getReadableInventoryErrorMessage } from "./errorMessages";

type DamageType = "returnable" | "nonreturnable";

interface UseDeferredItemSubmissionParams {
  barcode?: string;
  sessionId?: string;
  currentFloor?: string | null;
  currentRack?: string | null;
  currentLocationId?: string | null;
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
  recountTargetId?: string | null;
  blindRecountRequired?: boolean;
  recountBlockedReason?: string | null;
  onSuccess: () => void;
  countdownSeconds?: number;
}

export { toBackendPhotoProofs } from "./submissionPayload";

const getValidSerialNumbers = (isSerializedItem: boolean, serialNumbers: string[]): string[] =>
  isSerializedItem
    ? serialNumbers
        .filter((serial) => serial.trim().length > 0)
        .map((serial) => normalizeSerialValue(serial))
    : [];

const getValidSerialEntries = (isSerializedItem: boolean, serialEntries: SerialEntryData[]) =>
  isSerializedItem
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

const showSubmissionError = (error: any) => {
  const message = getReadableInventoryErrorMessage(error, "save-count");
  const status = error?.response?.status;
  if (status === 423) {
    toastService.show(message, { type: "warning" });
    return;
  }

  const titleByStatus: Record<number, string> = {
    409: "Duplicate Scan",
    422: "Check the Details",
  };
  Alert.alert(titleByStatus[status] || "Unable to Save Count", message);
};

const resolveDamageQuantities = (
  isDamageEnabled: boolean,
  damageType: DamageType,
  damageQty: string
) => {
  const parsedDamageQty = parseFloat(damageQty);
  return {
    damaged_qty: isDamageEnabled && damageType === "returnable" ? parsedDamageQty : 0,
    non_returnable_damaged_qty:
      isDamageEnabled && damageType === "nonreturnable" ? parsedDamageQty : 0,
  };
};

type SubmissionPayloadContext = {
  barcode?: string;
  sessionId: string;
  item: Item;
  quantity: string;
  currentFloor?: string | null;
  currentRack?: string | null;
  currentLocationId?: string | null;
  condition: string;
  remark: string;
  isDamageEnabled: boolean;
  damageQty: string;
  damageType: DamageType;
  isSerializedItem: boolean;
  serialNumbers: string[];
  serialEntries: SerialEntryData[];
  varianceRemark: string;
  mrp: string;
  hasMfgDate: boolean;
  itemMfgDate: string;
  itemMfgDateFormat: DateFormatType;
  hasExpiryDate: boolean;
  itemExpiryDate: string;
  itemExpiryDateFormat: DateFormatType;
  itemPhotos: string[];
  damagePhoto: string | null;
  recountTargetId?: string | null;
};

const resolveItemCode = (item: Item, barcode?: string) => {
  if (item.item_code) return item.item_code;
  return barcode || "";
};

const resolveItemName = (item: Item, barcode?: string) => {
  if (item.item_name) return item.item_name;
  if (item.name) return item.name;
  if (item.item_code) return item.item_code;
  return barcode || "";
};

const resolveLocationValue = (value?: string | null) => value || "Unknown";

const resolveMrpCountedValue = (mrp: string, item: Item) => {
  const parsed = parseFloat(mrp);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  return item.mrp || 0;
};

const resolveManufacturingDateValue = (hasMfgDate: boolean, itemMfgDate: string, item: Item) =>
  hasMfgDate && itemMfgDate ? itemMfgDate : item.manufacturing_date;

const resolveExpiryDateValue = (hasExpiryDate: boolean, itemExpiryDate: string, item: Item) =>
  hasExpiryDate && itemExpiryDate ? itemExpiryDate : item.expiry_date;

const resolvePhotoProofs = (damagePhoto: string | null, itemPhotos: string[]) => {
  const nowIso = new Date().toISOString();
  const backendPhotoProofs = toBackendPhotoProofs(
    [...(damagePhoto ? [damagePhoto] : []), ...itemPhotos],
    nowIso
  );
  return backendPhotoProofs.length > 0 ? backendPhotoProofs : undefined;
};

const buildCountLinePayload = (context: SubmissionPayloadContext): CreateCountLinePayload => {
  const {
    barcode,
    sessionId,
    item,
    quantity,
    currentFloor,
    currentRack,
    currentLocationId,
    condition,
    remark,
    isDamageEnabled,
    damageQty,
    damageType,
    isSerializedItem,
    serialNumbers,
    serialEntries,
    varianceRemark,
    mrp,
    hasMfgDate,
    itemMfgDate,
    itemMfgDateFormat,
    hasExpiryDate,
    itemExpiryDate,
    itemExpiryDateFormat,
    itemPhotos,
    damagePhoto,
  } = context;

  const validSerials = getValidSerialNumbers(isSerializedItem, serialNumbers);
  const serialEntriesData = getValidSerialEntries(isSerializedItem, serialEntries);
  const photoProofs = resolvePhotoProofs(damagePhoto, itemPhotos);
  const damageQuantities = resolveDamageQuantities(isDamageEnabled, damageType, damageQty);

  return {
    session_id: sessionId,
    location_id: currentLocationId || resolveLocationValue(currentFloor),
    recount_of_id: context.recountTargetId || undefined,
    item_code: resolveItemCode(item, barcode),
    item_name: resolveItemName(item, barcode),
    counted_qty: parseFloat(quantity),
    floor_no: resolveLocationValue(currentFloor),
    rack_no: resolveLocationValue(currentRack),
    item_condition: condition,
    remark,
    damage_included: isDamageEnabled,
    ...damageQuantities,
    serial_numbers: validSerials,
    serial_entries: serialEntriesData.length > 0 ? serialEntriesData : undefined,
    variance_note: varianceRemark,
    variance_reason: varianceRemark,
    mrp_counted: resolveMrpCountedValue(mrp, item),
    manufacturing_date: resolveManufacturingDateValue(hasMfgDate, itemMfgDate, item),
    mfg_date_format: hasMfgDate ? itemMfgDateFormat : undefined,
    expiry_date: resolveExpiryDateValue(hasExpiryDate, itemExpiryDate, item),
    expiry_date_format: hasExpiryDate ? itemExpiryDateFormat : undefined,
    photo_proofs: photoProofs,
  };
};

const handleSubmissionResult = async (
  result: { is_misplaced?: boolean },
  onSuccess: () => void
) => {
  if (result.is_misplaced) {
    Alert.alert(
      "Misplaced Item",
      "This item is not expected at this location. It has been flagged for review.",
      [{ text: "OK", onPress: onSuccess }]
    );
    return;
  }

  toastService.show("Item verified successfully", { type: "success" });
  onSuccess();
};

/**
 * Defers item submission with validation, countdown handling, and offline-aware save behavior.
 */
export const useDeferredItemSubmission = ({
  barcode,
  sessionId,
  currentFloor,
  currentRack,
  currentLocationId,
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
  recountTargetId,
  blindRecountRequired,
  recountBlockedReason,
  onSuccess,
  countdownSeconds = 5,
}: UseDeferredItemSubmissionParams) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitCountdown, setSubmitCountdown] = useState<number | null>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks an armed-but-not-yet-executed countdown so an unmount can flush the
  // submit instead of silently discarding the staff member's count.
  const pendingCountdownRef = useRef(false);

  const validateBeforeSubmit = useCallback(() => {
    if (!item || !sessionId) return false;

    if (recountBlockedReason) {
      Alert.alert("Recount Locked", recountBlockedReason);
      return false;
    }

    if (blindRecountRequired && !recountTargetId) {
      Alert.alert(
        "Blind Recount Unavailable",
        "This item requires a blind recount, but the recount target could not be resolved. Refresh the item and try again."
      );
      return false;
    }

    const qty = parseFloat(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Invalid Quantity", "Please enter a valid quantity");
      return false;
    }

    const hasSerials = serialEntries.some((entry) => entry.serial_number.trim().length > 0);
    if (isSerializedItem && hasSerials && !validateSerials()) {
      const errorDetails =
        serialValidationErrors.length > 0 ? ` ${serialValidationErrors.join(", ")}` : "";
      Alert.alert("Serial Number Error", `Please enter valid serial numbers.${errorDetails}`);
      return false;
    }

    if (isDamageEnabled) {
      const parsedDamageQty = parseFloat(damageQty);
      if (Number.isNaN(parsedDamageQty) || parsedDamageQty <= 0) {
        Alert.alert("Invalid Damage Quantity", "Please enter a valid damage quantity");
        return false;
      }

      if (!damagePhoto) {
        Alert.alert(
          "Photo Required",
          "Mandatory photo proof is required for all damage reports. Please capture a photo of the damaged item."
        );
        return false;
      }
    }

    return true;
  }, [
    damagePhoto,
    damageQty,
    blindRecountRequired,
    isDamageEnabled,
    isSerializedItem,
    item,
    quantity,
    recountBlockedReason,
    recountTargetId,
    serialEntries,
    serialValidationErrors,
    sessionId,
    validateSerials,
  ]);

  const executeSubmit = useCallback(async (options?: { silent?: boolean }) => {
    if (!item || !sessionId) return;

    pendingCountdownRef.current = false;
    setSubmitCountdown(null);
    setSubmitting(true);

    try {
      const payload = buildCountLinePayload({
        barcode,
        sessionId,
        item,
        quantity,
        currentFloor,
        currentRack,
        currentLocationId,
        condition,
        remark,
        isDamageEnabled,
        damageQty,
        damageType,
        isSerializedItem,
        serialNumbers,
        serialEntries,
        varianceRemark,
        mrp,
        hasMfgDate,
        itemMfgDate,
        itemMfgDateFormat,
        hasExpiryDate,
        itemExpiryDate,
        itemExpiryDateFormat,
        itemPhotos,
        damagePhoto,
        recountTargetId,
      });
      const result = await createCountLine(payload);
      if (options?.silent) {
        // Unmount flush: the screen is gone, so skip haptics and navigation
        // callbacks — persisting the count is all that matters here.
        toastService.show("Item verified successfully", { type: "success" });
        return;
      }
      await haptics.success();
      await handleSubmissionResult(result, onSuccess);
    } catch (error: any) {
      if (options?.silent) {
        toastService.show("Could not save the pending count. Please recount the item.", {
          type: "error",
        });
        return;
      }
      showSubmissionError(error);
    } finally {
      setSubmitting(false);
    }
  }, [
    barcode,
    condition,
    currentFloor,
    currentRack,
    currentLocationId,
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
    recountTargetId,
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
        setSubmitCountdown((previous) => (previous !== null ? previous - 1 : null));
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
    pendingCountdownRef.current = true;
    setSubmitCountdown(countdownSeconds);
  }, [countdownSeconds, validateBeforeSubmit]);

  const cancelSubmit = useCallback(() => {
    pendingCountdownRef.current = false;
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    setSubmitCountdown(null);
  }, []);

  const executeSubmitRef = useRef(executeSubmit);
  useEffect(() => {
    executeSubmitRef.current = executeSubmit;
  }, [executeSubmit]);

  useEffect(
    () => () => {
      // Unmounting mid-countdown (back navigation, screen swap) must not drop
      // the count: flush it now without navigation side effects.
      if (pendingCountdownRef.current) {
        pendingCountdownRef.current = false;
        void executeSubmitRef.current({ silent: true });
      }
    },
    []
  );

  return {
    submitting,
    submitCountdown,
    handleSubmitPress,
    cancelSubmit,
  };
};
