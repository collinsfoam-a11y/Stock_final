import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BarcodeScanningResult, CameraType } from 'expo-camera';
import { ScanEvent, ScannerSource, ScannerError } from './scanner.types';

interface CameraScannerViewProps {
  onScan: (event: ScanEvent) => void;
  onError: (error: ScannerError) => void;
  symbologyAllowlist?: string[];
  isActive: boolean;
  torchEnabled?: boolean;
  onTorchChange?: (enabled: boolean) => void;
}

export const CameraScannerView: React.FC<CameraScannerViewProps> = ({
  onScan,
  onError,
  symbologyAllowlist,
  isActive,
  torchEnabled = false,
  onTorchChange,
}) => {
  const [permissionResponse, requestPermission] = useCameraPermissions();
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const lastScannedValue = useRef<string | null>(null);
  const duplicateSuppressionWindow = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!permissionResponse) {
      requestPermission();
    }
  }, [permissionResponse, requestPermission]);

  const handleBarcodeScanned = (scanningResult: BarcodeScanningResult) => {
    if (!isActive) return;
    
    const rawType = (scanningResult as any).barcodeType || (scanningResult as any).type || '';
    
    // Check if this is a duplicate scan within the suppression window
    if (lastScannedValue.current === scanningResult.data) {
      return;
    }

    // Apply symbology filtering if allowlist is provided
    if (symbologyAllowlist && symbologyAllowlist.length > 0) {
      const symbology = String(rawType).toLowerCase();
      if (!symbologyAllowlist.includes(symbology)) {
        // Optionally notify about unsupported symbology
        return;
      }
    }

    // Set duplicate suppression
    lastScannedValue.current = scanningResult.data;
    if (duplicateSuppressionWindow.current) {
      clearTimeout(duplicateSuppressionWindow.current);
    }
    
    duplicateSuppressionWindow.current = setTimeout(() => {
      lastScannedValue.current = null;
    }, 1000); // 1 second suppression window

    const scanEvent: ScanEvent = {
      eventId: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      value: scanningResult.data,
      symbology: String(rawType),
      source: 'camera',
      capturedAt: new Date().toISOString(),
      deviceId: '', // Would be populated by platform service
    };

    onScan(scanEvent);
  };

  const toggleCameraType = () => {
    setCameraType(current => (current === 'back' ? 'front' : 'back'));
  };

  if (!permissionResponse) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permissions...</Text>
      </View>
    );
  }

  if (!permissionResponse.granted) {
    return (
      <View style={styles.container}>
        <Text>Camera permission required for scanning</Text>
        <Text onPress={() => requestPermission()} style={styles.permissionButton}>
          Grant Permission
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={cameraType}
        onBarcodeScanned={handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: [
            'ean13',
            'ean8', 
            'upc_a',
            'upc_e',
            'code39',
            'code128',
            'pdf417',
            'qr',
            'datamatrix',
            'codabar'
          ],
        }}
        enableTorch={torchEnabled}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  permissionButton: {
    color: '#007AFF',
    textDecorationLine: 'underline',
    marginTop: 10,
  },
});