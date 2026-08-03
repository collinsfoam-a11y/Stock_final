import { ScanEvent, ScannerError, ScannerState, ScannerController, ScannerSource } from './scanner.types';

export class ScannerControllerImpl implements ScannerController {
  private isScanning: boolean = false;
  private isAvailable: boolean = false;
  private permissionsGranted: boolean = false;
  private torchSupported: boolean = false;
  private torchEnabled: boolean = false;
  
  private scanListeners: Array<(event: ScanEvent) => void> = [];
  private errorListeners: Array<(error: ScannerError) => void> = [];
  
  private duplicateWindow: Map<string, number> = new Map();
  private DUPLICATE_SUPPRESSION_MS = 1000;

  constructor() {
    this.initializeScanner();
  }

  private async initializeScanner(): Promise<void> {
    try {
      // Check if scanner hardware is available
      this.isAvailable = await this.checkScannerAvailability();
      this.permissionsGranted = await this.checkPermissions();
      this.torchSupported = await this.checkTorchSupport();
    } catch (error) {
      console.error('Scanner initialization failed:', error);
      this.dispatchError({
        code: 'INITIALIZATION_FAILED',
        message: 'Scanner could not be initialized',
        source: 'camera',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async checkScannerAvailability(): Promise<boolean> {
    // Implementation would check for camera availability
    return true; // Placeholder
  }

  private async checkPermissions(): Promise<boolean> {
    // Implementation would check camera permissions
    return true; // Placeholder
  }

  private async checkTorchSupport(): Promise<boolean> {
    // Implementation would check if torch is supported
    return true; // Placeholder
  }

  async start(): Promise<void> {
    if (!this.permissionsGranted) {
      throw new Error('Scanner permissions not granted');
    }

    this.isScanning = true;
    
    // Notify listeners that scanning has started
    // Actual scanning implementation would go here
  }

  async stop(): Promise<void> {
    this.isScanning = false;
    
    // Stop any active scanning
    // Actual implementation would go here
  }

  async toggleTorch(): Promise<void> {
    if (!this.torchSupported) {
      throw new Error('Torch not supported on this device');
    }

    this.torchEnabled = !this.torchEnabled;
    
    // Actual torch toggle implementation would go here
  }

  subscribe(listener: (event: ScanEvent) => void): () => void {
    this.scanListeners.push(listener);
    
    return () => {
      const index = this.scanListeners.indexOf(listener);
      if (index !== -1) {
        this.scanListeners.splice(index, 1);
      }
    };
  }

  subscribeToErrors(listener: (error: ScannerError) => void): () => void {
    this.errorListeners.push(listener);
    
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index !== -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  getState(): ScannerState {
    return {
      isScanning: this.isScanning,
      isAvailable: this.isAvailable,
      permissionsGranted: this.permissionsGranted,
      torchSupported: this.torchSupported,
      torchEnabled: this.torchEnabled,
    };
  }

  // Public method to handle incoming scan events from various sources
  handleScanEvent(event: ScanEvent): void {
    // Check for duplicate suppression
    const duplicateKey = `${event.source}:${event.value}`;
    const now = Date.now();
    const lastScanTime = this.duplicateWindow.get(duplicateKey) || 0;
    
    if (now - lastScanTime < this.DUPLICATE_SUPPRESSION_MS) {
      // Suppress duplicate scan
      return;
    }
    
    this.duplicateWindow.set(duplicateKey, now);
    
    // Clean up old entries periodically
    this.cleanupDuplicateWindow(now);
    
    // Notify all listeners
    this.scanListeners.forEach(listener => listener(event));
  }

  // Public method to handle errors from various sources
  handleError(error: ScannerError): void {
    this.errorListeners.forEach(listener => listener(error));
  }

  private cleanupDuplicateWindow(currentTime: number): void {
    // Remove entries older than the suppression window
    for (const [key, time] of this.duplicateWindow.entries()) {
      if (currentTime - time > this.DUPLICATE_SUPPRESSION_MS * 2) {
        this.duplicateWindow.delete(key);
      }
    }
  }

  private dispatchError(error: ScannerError): void {
    this.errorListeners.forEach(listener => listener(error));
  }
}

// Export singleton instance
let scannerController: ScannerControllerImpl | null = null;

export const getScannerController = async (): Promise<ScannerController> => {
  if (!scannerController) {
    scannerController = new ScannerControllerImpl();
    await scannerController['initializeScanner'](); // Private method access for initialization
  }
  return scannerController;
};