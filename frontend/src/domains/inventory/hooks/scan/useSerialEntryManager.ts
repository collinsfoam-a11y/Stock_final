import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";

import { checkSerialUniqueness } from "@/services/api/api";
import { Item, SerialEntryData } from "@/types/scan";
import {
  normalizeSerialValue,
  validateSerialNumber,
  validateSerialNumbers,
} from "@/utils/scanUtils";

interface UseSerialEntryManagerParams {
  item: Item | null;
  mrp: string;
  quantity: string;
  sessionId?: string;
  onQuantityChange: (value: string) => void;
}

const createSerialEntryId = () => {
  try {
    if (typeof Crypto.randomUUID === "function") {
      return `serial_${Crypto.randomUUID()}`;
    }
  } catch {
    // Expo Crypto can expose randomUUID on web but still fail in insecure
    // browser contexts. Serial row IDs are local UI keys.
  }

  return `serial_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const getDefaultMrp = (mrp: string, item: Item | null) => {
  const parsedMrp = parseFloat(mrp);
  return Number.isFinite(parsedMrp) ? parsedMrp : item?.mrp;
};

export const useSerialEntryManager = ({
  item,
  mrp,
  quantity,
  sessionId,
  onQuantityChange,
}: UseSerialEntryManagerParams) => {
  const [serialEntries, setSerialEntries] = useState<SerialEntryData[]>([]);
  const [isSerializedItem, setIsSerializedItem] = useState(false);
  const [serialValidationErrors, setSerialValidationErrors] = useState<string[]>([]);
  const [showSerialScanner, setShowSerialScanner] = useState(false);
  const serialEntriesRef = useRef<SerialEntryData[]>([]);
  const reservedSerialsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    serialEntriesRef.current = serialEntries;
  }, [serialEntries]);

  const serialNumbers = useMemo(
    () => serialEntries.map((entry) => entry.serial_number),
    [serialEntries]
  );

  const filledSerialCount = useMemo(
    () => serialNumbers.filter((serial) => serial.trim().length > 0).length,
    [serialNumbers]
  );

  useEffect(() => {
    if (isSerializedItem && filledSerialCount > 0) {
      onQuantityChange(String(filledSerialCount));
    }
  }, [filledSerialCount, isSerializedItem, onQuantityChange]);

  const handleSerialChange = useCallback(
    (index: number, field: keyof SerialEntryData, value: string | number) => {
      setSerialEntries((previous) => {
        const updated = [...previous];
        if (updated[index]) {
          if (field === "serial_number") {
            reservedSerialsRef.current.delete(normalizeSerialValue(updated[index].serial_number));
          }
          updated[index] = {
            ...updated[index],
            [field]: field === "serial_number" ? String(value).toUpperCase() : value,
          };
        }
        return updated;
      });
      setSerialValidationErrors([]);
    },
    []
  );

  const handleSerialBlur = useCallback(
    (index: number) => {
      setSerialEntries((previous) => {
        const updated = [...previous];
        if (updated[index] && typeof updated[index].serial_number === "string") {
          const normalized = normalizeSerialValue(updated[index].serial_number);
          updated[index] = {
            ...updated[index],
            serial_number: normalized,
            is_valid: normalized.length > 0,
          };
        }
        return updated;
      });
    },
    []
  );

  const handleSerialScanned = useCallback(
    async (data: { serial_number: string; mrp?: number; manufacturing_date?: string }) => {
      const normalized = normalizeSerialValue(data.serial_number);
      if (!normalized) {
        return false;
      }

      const isLocalDuplicate =
        reservedSerialsRef.current.has(normalized) ||
        serialEntriesRef.current.some(
          (entry) => normalizeSerialValue(entry.serial_number) === normalized
        );
      if (isLocalDuplicate) {
        Alert.alert("Duplicate Serial", "This serial number is already in your list.");
        return false;
      }

      reservedSerialsRef.current.add(normalized);

      if (sessionId) {
        const result = await checkSerialUniqueness(sessionId, normalized, item?.item_code);
        if (result.status === "UNAVAILABLE") {
          reservedSerialsRef.current.delete(normalized);
          Alert.alert(
            "Serial Validation Unavailable",
            "We could not verify this serial number right now. Please try again when the connection is stable."
          );
          return false;
        }
        if (result.exists) {
          reservedSerialsRef.current.delete(normalized);
          Alert.alert(
            "Serial Already Counted",
            `Serial ${normalized} was already counted in this session.\n\n` +
              `Item: ${result.item_name || result.item_code}\n` +
              `Location: Floor ${result.floor_no}, Rack ${result.rack_no}\n` +
              `Counted by: ${result.counted_by}`,
            [{ text: "OK" }]
          );
          return false;
        }
      }

      const newEntry: SerialEntryData = {
        id: createSerialEntryId(),
        serial_number: normalized,
        mrp: data.mrp ?? getDefaultMrp(mrp, item),
        manufacturing_date: data.manufacturing_date ?? item?.manufacturing_date,
        scanned_at: new Date().toISOString(),
        is_valid: true,
      };

      setSerialEntries((previous) => {
        const currentIndex = previous.findIndex(
          (entry) => normalizeSerialValue(entry.serial_number) === normalized
        );
        if (currentIndex >= 0) {
          return previous;
        }

        return [...previous, newEntry];
      });
      return true;
    },
    [item, mrp, sessionId]
  );

  const handleAddSerial = useCallback(() => {
    const newEntry: SerialEntryData = {
      id: createSerialEntryId(),
      serial_number: "",
      mrp: getDefaultMrp(mrp, item),
      manufacturing_date: item?.manufacturing_date,
      is_valid: false,
    };
    setSerialEntries((previous) => [...previous, newEntry]);
  }, [item, mrp]);

  const handleRemoveSerial = useCallback(
    (index: number) => {
      setSerialEntries((previous) => {
        const removedSerial = previous[index]?.serial_number;
        if (removedSerial) {
          reservedSerialsRef.current.delete(normalizeSerialValue(removedSerial));
        }

        if (previous.length <= 1) {
          return [
            {
              id: createSerialEntryId(),
              serial_number: "",
              mrp: getDefaultMrp(mrp, item),
              is_valid: false,
            },
          ];
        }
        return previous.filter((_, currentIndex) => currentIndex !== index);
      });
    },
    [item, mrp]
  );

  const serialValidationMessages = useMemo(
    () =>
      serialEntries.reduce<Record<string, string | null>>((acc, entry) => {
        acc[entry.id] = entry.serial_number.trim() ? validateSerialNumber(entry.serial_number) : null;
        return acc;
      }, {}),
    [serialEntries]
  );

  const validateSerials = useCallback((): boolean => {
    if (!isSerializedItem) return true;

    const qty = parseInt(quantity) || 1;
    const filledSerials = serialNumbers.filter((serial) => serial.trim().length > 0);
    const validation = validateSerialNumbers(filledSerials, qty);

    if (!validation.valid) {
      setSerialValidationErrors(validation.errors);
      return false;
    }

    setSerialValidationErrors([]);
    return true;
  }, [isSerializedItem, quantity, serialNumbers]);

  const resetSerialState = useCallback(() => {
    setIsSerializedItem(false);
    setSerialEntries([]);
    serialEntriesRef.current = [];
    reservedSerialsRef.current.clear();
    setSerialValidationErrors([]);
    setShowSerialScanner(false);
  }, []);

  return {
    handleAddSerial,
    handleRemoveSerial,
    handleSerialBlur,
    handleSerialChange,
    handleSerialScanned,
    isSerializedItem,
    resetSerialState,
    serialEntries,
    serialNumbers,
    serialValidationErrors,
    serialValidationMessages,
    setIsSerializedItem,
    setShowSerialScanner,
    showSerialScanner,
    validateSerials,
  };
};
