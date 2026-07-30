import { useRef, useCallback, useState } from "react";
import * as Haptics from "expo-haptics";
import { playScanSound } from "../../../../services/scanSoundService";
import { toastService } from "../../../../services/toastService";

const SCAN_BUFFER_TIMEOUT = 2000;
const SCAN_BUFFER_MAX_SIZE = 10;
const SCAN_CONFIDENCE_THRESHOLD = 2;

interface UseScanBufferProps {
  scannerVibration: boolean;
  scannerSound: boolean;
  scannerAutoSubmit: boolean;
  onConfidentScan: (barcode: string) => Promise<void>;
  setIsScanning: (val: boolean) => void;
  setSearchQuery: (val: string) => void;
}

export function useScanBuffer({
  scannerVibration,
  scannerSound,
  scannerAutoSubmit,
  onConfidentScan,
  setIsScanning,
  setSearchQuery,
}: UseScanBufferProps) {
  const [scanned, setScanned] = useState(false);
  const scanBufferRef = useRef<{ code: string; count: number; timestamp: number }[]>([]);

  const handleBarcodeScan = useCallback(
    async ({ data }: { data: string }) => {
      if (scanned) return;

      const now = Date.now();
      const trimmedData = data.trim();

      // Buffer logic
      scanBufferRef.current = scanBufferRef.current.filter(
        (entry) => now - entry.timestamp < SCAN_BUFFER_TIMEOUT
      );

      const existingIndex = scanBufferRef.current.findIndex((entry) => entry.code === trimmedData);

      if (existingIndex >= 0) {
        scanBufferRef.current[existingIndex]!.count += 1;
        scanBufferRef.current[existingIndex]!.timestamp = now;
      } else {
        scanBufferRef.current.push({
          code: trimmedData,
          count: 1,
          timestamp: now,
        });
      }

      if (scanBufferRef.current.length > SCAN_BUFFER_MAX_SIZE) {
        scanBufferRef.current = scanBufferRef.current.slice(-SCAN_BUFFER_MAX_SIZE);
      }

      const confident = scanBufferRef.current.find(
        (entry) => entry.count >= SCAN_CONFIDENCE_THRESHOLD
      );

      if (!confident) {
        if (scannerVibration) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        return;
      }

      setScanned(true);
      scanBufferRef.current = [];
      if (scannerVibration) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      void playScanSound("capture", scannerSound);
      setIsScanning(false);
      setSearchQuery(confident.code);

      if (scannerAutoSubmit) {
        await onConfidentScan(confident.code);
        return;
      }

      toastService.show("Scan captured. Review and submit when ready.", {
        type: "info",
      });
      setScanned(false);
    },
    [
      scanned,
      scannerVibration,
      scannerSound,
      scannerAutoSubmit,
      onConfidentScan,
      setIsScanning,
      setSearchQuery,
    ]
  );

  return {
    scanned,
    setScanned,
    handleBarcodeScan,
  };
}
