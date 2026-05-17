import React, { forwardRef, useMemo } from "react";
import { View, type ViewProps } from "react-native";

export type CameraType = "back" | "front";

export type BarcodeScanningResult = {
  data: string;
  type?: string;
};

export type CameraCapturedPicture = {
  uri: string;
};

export type CameraPermissionResponse = {
  granted: false;
  canAskAgain: false;
};

export type CameraViewRef = {
  takePictureAsync: (
    options?: Record<string, unknown>,
  ) => Promise<CameraCapturedPicture | undefined>;
};

type CameraViewProps = ViewProps & {
  facing?: CameraType;
  ratio?: string;
  barcodeScannerSettings?: unknown;
  onBarcodeScanned?: ((result: BarcodeScanningResult) => void) | undefined;
};

const UNSUPPORTED_CAMERA_PERMISSION: CameraPermissionResponse = {
  granted: false,
  canAskAgain: false,
};

export function useCameraPermissions(): [
  CameraPermissionResponse,
  () => Promise<CameraPermissionResponse>,
  () => Promise<CameraPermissionResponse>,
] {
  const permission = useMemo(() => UNSUPPORTED_CAMERA_PERMISSION, []);
  const resolvePermission = async () => permission;

  return [permission, resolvePermission, resolvePermission];
}

export const CameraView = forwardRef<CameraViewRef, CameraViewProps>(
  ({ children, ...props }, ref) => {
    React.useImperativeHandle(
      ref,
      () => ({
        async takePictureAsync() {
          return undefined;
        },
      }),
      [],
    );

    return <View {...props}>{children}</View>;
  },
);

CameraView.displayName = "CameraView";
