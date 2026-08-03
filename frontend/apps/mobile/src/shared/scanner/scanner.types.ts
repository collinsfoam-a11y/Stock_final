export type ScannerSource =
  | 'camera'
  | 'hid'
  | 'datawedge'
  | 'honeywell'
  | 'manual';

export interface ScanEvent {
  eventId: string;
  value: string;
  symbology?: string;
  source: ScannerSource;
  capturedAt: string;
  deviceId: string;
}

export interface ScannerError {
  code: string;
  message: string;
  source: ScannerSource;
  timestamp: string;
}

export interface ScannerState {
  isScanning: boolean;
  isAvailable: boolean;
  permissionsGranted: boolean;
  torchSupported: boolean;
  torchEnabled: boolean;
}

export interface ScannerController {
  start(): Promise<void>;
  stop(): Promise<void>;
  toggleTorch(): Promise<void>;
  subscribe(listener: (event: ScanEvent) => void): () => void;
  subscribeToErrors(listener: (error: ScannerError) => void): () => void;
  getState(): ScannerState;
}