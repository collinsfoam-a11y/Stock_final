export {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner
} from "react-native-vision-camera";
export type BarcodeScanningResult = {
  data: string;
  type?: string;
};
