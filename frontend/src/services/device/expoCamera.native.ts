import type { CameraView as ExpoCameraView } from "expo-camera";

export {
  CameraView,
  useCameraPermissions,
  type CameraType,
  type BarcodeScanningResult,
} from "expo-camera";

export type CameraCapturedPicture = {
  uri: string;
};

export type CameraViewRef = ExpoCameraView;
