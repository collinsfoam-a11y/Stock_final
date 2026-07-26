import { useCallback, useState } from "react";

import { DateFormatType } from "@/types/scan";
import { useFlexibleDateField } from "@/domains/inventory/hooks/scan/useFlexibleDateField";

export const useItemMetadataState = () => {
  const [mrpEditable, setMrpEditable] = useState(false);
  const [hasMfgDate, setHasMfgDate] = useState(false);
  const [hasExpiryDate, setHasExpiryDate] = useState(false);
  const [itemMfgDate, setItemMfgDate] = useState("");
  const [itemMfgDateFormat, setItemMfgDateFormat] =
    useState<DateFormatType>("full");
  const [itemExpiryDate, setItemExpiryDate] = useState("");
  const [itemExpiryDateFormat, setItemExpiryDateFormat] =
    useState<DateFormatType>("full");

  const mfgDateField = useFlexibleDateField({
    value: itemMfgDate,
    format: itemMfgDateFormat,
    onChangeValue: setItemMfgDate,
    onChangeFormat: setItemMfgDateFormat,
  });

  const expiryDateField = useFlexibleDateField({
    value: itemExpiryDate,
    format: itemExpiryDateFormat,
    onChangeValue: setItemExpiryDate,
    onChangeFormat: setItemExpiryDateFormat,
  });

  const toggleMfgDateEnabled = useCallback((enabled: boolean) => {
    setHasMfgDate(enabled);
    if (!enabled) {
      setItemMfgDate("");
    }
  }, []);

  const toggleExpiryDateEnabled = useCallback((enabled: boolean) => {
    setHasExpiryDate(enabled);
    if (!enabled) {
      setItemExpiryDate("");
    }
  }, []);

  const resetMetadataState = useCallback(() => {
    setMrpEditable(false);
    setHasMfgDate(false);
    setHasExpiryDate(false);
    setItemMfgDate("");
    setItemMfgDateFormat("full");
    setItemExpiryDate("");
    setItemExpiryDateFormat("full");
  }, []);

  return {
    expiryDateField,
    hasExpiryDate,
    hasMfgDate,
    itemExpiryDate,
    itemExpiryDateFormat,
    itemMfgDate,
    itemMfgDateFormat,
    mfgDateField,
    mrpEditable,
    resetMetadataState,
    setMrpEditable,
    toggleExpiryDateEnabled,
    toggleMfgDateEnabled,
  };
};
