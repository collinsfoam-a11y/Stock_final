import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";

import { Item } from "@/types/scan";

export interface QuantityUomInfo {
  precision: number;
  label: string;
  step: number;
  unit: string;
}

interface UseQuantityCountManagerParams {
  item: Pick<Item, "uom" | "uom_name" | "uom_code"> | null;
  quantity: string;
  setQuantity: (value: string) => void;
}

export const useQuantityCountManager = ({
  item,
  quantity,
  setQuantity,
}: UseQuantityCountManagerParams) => {
  const [splitCounts, setSplitCounts] = useState<string[]>([]);
  const [isSplitMode, setIsSplitMode] = useState(false);

  const uomInfo = useMemo<QuantityUomInfo>(() => {
    const normalizedUom = (
      item?.uom ||
      item?.uom_name ||
      item?.uom_code ||
      ""
    ).toLowerCase();

    if (
      normalizedUom.includes("kg") ||
      normalizedUom.includes("gram") ||
      normalizedUom.includes("gm") ||
      normalizedUom.includes("kilogram")
    ) {
      return { precision: 3, label: "Weight", step: 0.05, unit: "kg" };
    }

    if (
      normalizedUom.includes("liter") ||
      normalizedUom.includes("litre") ||
      normalizedUom.includes("ml") ||
      normalizedUom.includes("mtr")
    ) {
      return { precision: 2, label: "Volume", step: 0.1, unit: "L" };
    }

    if (
      normalizedUom.includes("meter") ||
      normalizedUom.includes("mtr") ||
      normalizedUom.includes("sqft")
    ) {
      return {
        precision: 2,
        label: "Measurement",
        step: 0.1,
        unit: normalizedUom,
      };
    }

    return { precision: 0, label: "Count", step: 1, unit: normalizedUom || "Pcs" };
  }, [item?.uom, item?.uom_code, item?.uom_name]);

  const isWeightBasedUOM = uomInfo.precision > 0;

  const formatQuantity = useCallback(
    (value: string | number) => {
      const numericValue =
        typeof value === "string" ? parseFloat(value) : value;
      if (Number.isNaN(numericValue)) return "0";

      if (uomInfo.precision > 0) {
        return (
          numericValue.toFixed(uomInfo.precision).replace(/\.?0+$/, "") || "0"
        );
      }

      return Math.floor(numericValue).toString();
    },
    [uomInfo.precision],
  );

  const isValidQuantityInput = useCallback(
    (value: string) => {
      if (value === "" || value === "." || value === "0.") return true;

      if (uomInfo.precision > 0) {
        const decimalRegex = new RegExp(`^\\d*\\.?\\d{0,${uomInfo.precision}}$`);
        return decimalRegex.test(value);
      }

      return /^\d*$/.test(value);
    },
    [uomInfo.precision],
  );

  const handleQuantityChange = useCallback(
    (value: string) => {
      if (!isValidQuantityInput(value)) return;
      setQuantity(value);
    },
    [isValidQuantityInput, setQuantity],
  );

  const handleQuantityBlur = useCallback(() => {
    if (!quantity || quantity === "." || quantity === "0.") {
      setQuantity("0");
      return;
    }

    setQuantity(formatQuantity(quantity));
  }, [formatQuantity, quantity, setQuantity]);

  const handleDecrement = useCallback(() => {
    if (isSplitMode) return;

    const currentValue = parseFloat(quantity) || 0;
    const step = uomInfo.step;

    if (currentValue > step) {
      setQuantity(formatQuantity(currentValue - step));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (currentValue > 0) {
      setQuantity("0");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [formatQuantity, isSplitMode, quantity, setQuantity, uomInfo.step]);

  const handleIncrement = useCallback(() => {
    if (isSplitMode) return;

    const currentValue = parseFloat(quantity) || 0;
    setQuantity(formatQuantity(currentValue + uomInfo.step));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [formatQuantity, isSplitMode, quantity, setQuantity, uomInfo.step]);

  const handleToggleSplitMode = useCallback(() => {
    const nextSplitMode = !isSplitMode;
    setIsSplitMode(nextSplitMode);
    if (nextSplitMode && splitCounts.length === 0) {
      setSplitCounts([quantity !== "0" ? quantity : ""]);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [isSplitMode, quantity, splitCounts.length]);

  const handleSplitCountChange = useCallback(
    (index: number, value: string) => {
      if (!isValidQuantityInput(value)) return;

      setSplitCounts((previous) => {
        const updated = [...previous];
        updated[index] = value;
        return updated;
      });
    },
    [isValidQuantityInput],
  );

  const handleSplitCountBlur = useCallback(
    (index: number) => {
      setSplitCounts((previous) => {
        const updated = [...previous];
        const currentValue = updated[index] ?? "";
        updated[index] =
          currentValue === "" || currentValue === "."
            ? "0"
            : formatQuantity(currentValue);
        return updated;
      });
    },
    [formatQuantity],
  );

  const handleRemoveSplitCount = useCallback((index: number) => {
    setSplitCounts((previous) => previous.filter((_, current) => current !== index));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleAddSplitCount = useCallback(() => {
    setSplitCounts((previous) => [...previous, ""]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const resetQuantityState = useCallback(() => {
    setQuantity("0");
    setSplitCounts([]);
    setIsSplitMode(false);
  }, [setQuantity]);

  const handleClearSplitCounts = useCallback(() => {
    Alert.alert(
      "Clear Split Counts?",
      "This will reset all individual pieces.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: resetQuantityState,
        },
      ],
    );
  }, [resetQuantityState]);

  useEffect(() => {
    if (!isSplitMode) return;

    if (splitCounts.length === 0) {
      setQuantity("0");
      return;
    }

    const sum = splitCounts.reduce(
      (accumulator, currentValue) => accumulator + (parseFloat(currentValue) || 0),
      0,
    );
    setQuantity(formatQuantity(sum));
  }, [formatQuantity, isSplitMode, setQuantity, splitCounts]);

  return {
    handleAddSplitCount,
    handleClearSplitCounts,
    handleDecrement,
    handleIncrement,
    handleQuantityBlur,
    handleQuantityChange,
    handleRemoveSplitCount,
    handleSplitCountBlur,
    handleSplitCountChange,
    handleToggleSplitMode,
    isSplitMode,
    isWeightBasedUOM,
    resetQuantityState,
    splitCounts,
    uomInfo,
  };
};
