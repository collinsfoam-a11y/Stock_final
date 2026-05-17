import React from "react";

import { OptionSelectModal } from "@/components/modals/OptionSelectModal";
import { SerialScannerModal } from "@/components/modals/SerialScannerModal";
import { DatePickerState } from "@/domains/inventory/hooks/scan/useFlexibleDateField";

interface PickerFieldControls {
  closePicker: () => void;
  pickerState: DatePickerState;
  selectOption: (value: string) => void;
}

interface ItemDetailModalsProps {
  defaultMrp?: number;
  existingSerials: string[];
  expiryDateField: PickerFieldControls;
  itemName?: string;
  mfgDateField: PickerFieldControls;
  onCloseSerialScanner: () => void;
  onSerialScanned: (data: {
    serial_number: string;
    mrp?: number;
    manufacturing_date?: string;
  }) => boolean | Promise<boolean>;
  serialScannerVisible: boolean;
}

export function ItemDetailModals({
  defaultMrp,
  existingSerials,
  expiryDateField,
  itemName,
  mfgDateField,
  onCloseSerialScanner,
  onSerialScanned,
  serialScannerVisible,
}: ItemDetailModalsProps) {
  return (
    <>
      <OptionSelectModal
        visible={mfgDateField.pickerState.visible}
        title={mfgDateField.pickerState.title}
        options={mfgDateField.pickerState.options}
        onSelect={mfgDateField.selectOption}
        onClose={mfgDateField.closePicker}
      />

      <OptionSelectModal
        visible={expiryDateField.pickerState.visible}
        title={expiryDateField.pickerState.title}
        options={expiryDateField.pickerState.options}
        onSelect={expiryDateField.selectOption}
        onClose={expiryDateField.closePicker}
      />

      <SerialScannerModal
        visible={serialScannerVisible}
        existingSerials={existingSerials}
        itemName={itemName}
        defaultMrp={defaultMrp}
        onSerialScanned={onSerialScanned}
        onClose={onCloseSerialScanner}
      />
    </>
  );
}
