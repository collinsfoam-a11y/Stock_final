import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

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

const createSerialEntryId = () =>
  `serial_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

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
  const [serialValidationErrors, setSerialValidationErrors] = useState<
    string[]
  >([]);
  const [showSerialScanner, setShowSerialScanner] = useState(false);

  const serialNumbers = useMemo(
    () => serialEntries.map((entry) => entry.serial_number),
    [serialEntries],
  );

  useEffect(() => {
    if (isSerializedItem && serialEntries.length > 0) {
      onQuantityChange(String(serialEntries.length));
    }
  }, [isSerializedItem, onQuantityChange, serialEntries.length]);

  const handleSerialChange = useCallback(
    (index: number, field: keyof SerialEntryData, value: string | number) => {
      setSerialEntries((previous) => {
        const updated = [...previous];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            [field]:
              field === "serial_number" ? String(value).toUpperCase() : value,
          };
        }
        return updated;
      });
      setSerialValidationErrors([]);
    },
    [],
  );

  const handleSerialScanned = useCallback(
    async (data: {
      serial_number: string;
      mrp?: number;
      manufacturing_date?: string;
    }) => {
      const normalized = normalizeSerialValue(data.serial_number);

      const isLocalDuplicate = serialEntries.some(
        (entry) => entry.serial_number.toUpperCase() === normalized,
      );
      if (isLocalDuplicate) {
        Alert.alert(
          "Duplicate Serial",
          "This serial number is already in your list.",
        );
        return false;
      }

      if (sessionId) {
        const result = await checkSerialUniqueness(sessionId, normalized);
        if (result.exists) {
          Alert.alert(
            "Serial Already Counted",
            `Serial ${normalized} was already counted in this session.\n\n` +
              `Item: ${result.item_name || result.item_code}\n` +
              `Location: Floor ${result.floor_no}, Rack ${result.rack_no}\n` +
              `Counted by: ${result.counted_by}`,
            [{ text: "OK" }],
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

      setSerialEntries((previous) => [...previous, newEntry]);
      return true;
    },
    [item, mrp, serialEntries, sessionId],
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
        if (previous.length <= 1) {
          return [
            {
              id: `serial_${Date.now()}`,
              serial_number: "",
              mrp: getDefaultMrp(mrp, item),
              is_valid: false,
            },
          ];
        }
        return previous.filter((_, currentIndex) => currentIndex !== index);
      });
    },
    [item, mrp],
  );

  const serialValidationMessages = useMemo(
    () =>
      serialEntries.map((entry) =>
        entry.serial_number.trim()
          ? validateSerialNumber(entry.serial_number)
          : null,
      ),
    [serialEntries],
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
    setSerialValidationErrors([]);
    setShowSerialScanner(false);
  }, []);

  return {
    handleAddSerial,
    handleRemoveSerial,
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
