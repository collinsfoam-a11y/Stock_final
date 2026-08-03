export interface Scanner {
  startScanning(): Promise<void>;
  stopScanning(): Promise<void>;
  onScan(callback: (result: ScanResult) => void): void;
  onError(callback: (error: Error) => void): void;
  isScanning(): boolean;
}

export interface ScanResult {
  code: string;
  type: string;
  timestamp: Date;
  rawResult?: any;
}

export enum ScannerType {
  BLUETOOTH_HID = 'bluetooth_hid',  // Primary for warehouses
  CAMERA = 'camera',                // Fallback
  USB_HID = 'usb_hid',              // Alternative
  MANUAL = 'manual',                // Last resort
}