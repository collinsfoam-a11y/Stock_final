/**
 * Hardware & Software Barcode Scanner Resolver
 * Enforces strict priority hierarchy:
 * 1. Bluetooth HID
 * 2. Enterprise SDK (Zebra / Honeywell DataWedge)
 * 3. Keyboard Wedge
 * 4. Camera Scanner
 * 5. Manual Entry
 */

export interface ScannerAvailability {
  bluetoothHidAvailable: boolean;
  enterpriseSdkAvailable: boolean;
  keyboardWedgeAvailable: boolean;
  cameraAvailable: boolean;
}

export type ScannerSelection = 'BLUETOOTH_HID' | 'ENTERPRISE_SDK' | 'KEYBOARD_WEDGE' | 'CAMERA' | 'MANUAL';

export class ScannerResolver {
  public static selectScanner(availability: ScannerAvailability): ScannerSelection {
    if (availability.bluetoothHidAvailable) {
      return 'BLUETOOTH_HID';
    }
    if (availability.enterpriseSdkAvailable) {
      return 'ENTERPRISE_SDK';
    }
    if (availability.keyboardWedgeAvailable) {
      return 'KEYBOARD_WEDGE';
    }
    if (availability.cameraAvailable) {
      return 'CAMERA';
    }
    return 'MANUAL';
  }

  public static handleScannerFallback(
    current: ScannerSelection,
    availability: ScannerAvailability
  ): ScannerSelection {
    const degradedAvailability = { ...availability };
    if (current === 'BLUETOOTH_HID') degradedAvailability.bluetoothHidAvailable = false;
    if (current === 'ENTERPRISE_SDK') degradedAvailability.enterpriseSdkAvailable = false;
    if (current === 'KEYBOARD_WEDGE') degradedAvailability.keyboardWedgeAvailable = false;
    if (current === 'CAMERA') degradedAvailability.cameraAvailable = false;

    return ScannerResolver.selectScanner(degradedAvailability);
  }
}
