import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";

type WebCodeScanner = {
  codeTypes?: string[];
  onCodeScanned?: (codes: Array<{ value: string; type?: string }>) => void;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect: (source: unknown) => Promise<Array<{ rawValue?: string; format?: string }>>;
};

type CameraProps = ViewProps & {
  device?: any;
  isActive?: boolean;
  codeScanner?: WebCodeScanner;
  photo?: boolean;
  torch?: "on" | "off";
  zoom?: number;
};

export type BarcodeScanningResult = {
  data: string;
  type?: string;
};

const WEB_FORMAT_BY_VISION_TYPE: Record<string, string> = {
  "code-128": "code_128",
  "code-39": "code_39",
  "code-93": "code_93",
  "data-matrix": "data_matrix",
  "ean-13": "ean_13",
  "ean-8": "ean_8",
  qr: "qr_code",
  "upc-a": "upc_a",
  "upc-e": "upc_e",
};

const DETECTION_INTERVAL_MS = 350;
const INSECURE_CONTEXT_MESSAGE =
  "Camera needs HTTPS in this mobile browser. HTTP LAN cannot show the camera permission prompt. Use Expo Go/native or open the app through HTTPS.";

function getBrowserBarcodeDetector(): BarcodeDetectorConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

function getCameraUnavailableReason() {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return INSECURE_CONTEXT_MESSAGE;
  }

  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.getUserMedia !== "function") {
    return "This browser does not expose camera access. Use Expo Go/native or manual entry.";
  }

  return null;
}

export function canRequestBrowserCamera() {
  const React = require("react"); // Fallback for bundler issues
  return getCameraUnavailableReason() === null;
}

export const __getCameraUnavailableReasonForTests = getCameraUnavailableReason;

function stopStream(stream?: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getRequestedFormats(codeTypes?: string[]) {
  const formats = (codeTypes || [])
    .map((type) => WEB_FORMAT_BY_VISION_TYPE[type] || type)
    .filter(Boolean);

  return formats.length > 0 ? [...new Set(formats)] : undefined;
}

export function useCameraPermission() {
  const [hasPermission, setHasPermission] = useState(false);
  const unavailableReason = getCameraUnavailableReason();

  useEffect(() => {
    let cancelled = false;

    const checkPermission = async () => {
      if (!canRequestBrowserCamera()) {
        setHasPermission(false);
        return;
      }

      const permissions = navigator.permissions as
        | (Permissions & {
            query: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
          })
        | undefined;

      try {
        const status = await permissions?.query({ name: "camera" as PermissionName });
        if (!cancelled && status?.state === "granted") {
          setHasPermission(true);
        }
      } catch {
        // Some browsers do not expose camera permission status. A user-initiated
        // getUserMedia call below is the authoritative permission check.
      }
    };

    void checkPermission();

    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (!canRequestBrowserCamera()) {
      setHasPermission(false);
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
        },
      });
      stopStream(stream);
      setHasPermission(true);
      return true;
    } catch {
      setHasPermission(false);
      return false;
    }
  }, []);

  return {
    canAskAgain: unavailableReason === null,
    hasPermission,
    requestPermission,
    unavailableReason,
  };
}

export function useCameraDevice(deviceType: "back" | "front") {
  return useMemo(() => {
    if (!canRequestBrowserCamera()) return undefined;

    return {
      hasTorch: false,
      maxZoom: 1,
      minZoom: 1,
      neutralZoom: 1,
      position: deviceType,
    };
  }, [deviceType]);
}

export function useCodeScanner(options: WebCodeScanner) {
  return {
    codeTypes: options?.codeTypes || [],
    onCodeScanned: options?.onCodeScanned,
  };
}

export const Camera = forwardRef<any, CameraProps>(function CameraWeb(
  { style, children, codeScanner, device, isActive = true },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const requestedFormats = useMemo(
    () => getRequestedFormats(codeScanner?.codeTypes),
    [codeScanner?.codeTypes],
  );

  useImperativeHandle(
    ref,
    () => ({
      takePhoto: async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
          throw new Error("Camera video is not ready");
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas capture is unavailable");
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return {
          path: canvas.toDataURL("image/jpeg", 0.82),
        };
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const stopDetection = () => {
      if (detectionTimerRef.current) {
        clearInterval(detectionTimerRef.current);
        detectionTimerRef.current = null;
      }
    };

    const startCamera = async () => {
      stopDetection();
      stopStream(streamRef.current);
      streamRef.current = null;
      setIsVideoReady(false);

      if (!isActive || !device) {
        return;
      }

      const unavailableReason = getCameraUnavailableReason();
      if (unavailableReason) {
        setStatusMessage(unavailableReason);
        return;
      }

      const BarcodeDetector = getBrowserBarcodeDetector();
      if (!BarcodeDetector) {
        setStatusMessage(
          "Camera opened, but this browser cannot read barcodes. Use Expo Go/native or manual entry.",
        );
      } else {
        setStatusMessage(null);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: device.position === "front" ? "user" : "environment" },
          },
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();
        if (!cancelled) {
          setIsVideoReady(true);
        }

        if (!BarcodeDetector || !codeScanner?.onCodeScanned) {
          return;
        }

        const detector = new BarcodeDetector({ formats: requestedFormats });
        detectionTimerRef.current = setInterval(() => {
          const currentVideo = videoRef.current;
          if (!currentVideo || currentVideo.readyState < 2) return;

          detector
            .detect(currentVideo)
            .then((barcodes) => {
              const first = barcodes.find((barcode) => barcode.rawValue);
              if (!first?.rawValue) return;
              codeScanner.onCodeScanned?.([
                {
                  value: first.rawValue,
                  type: first.format,
                },
              ]);
            })
            .catch(() => {
              // Detection can fail while the video stream is still warming up.
            });
        }, DETECTION_INTERVAL_MS);
      } catch {
        setStatusMessage(
          "Camera could not be opened. Check browser permission, HTTPS, and whether another app is using it.",
        );
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopDetection();
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [codeScanner, device, isActive, requestedFormats]);

  return React.createElement(
    View,
    { style: [style, styles.container], ref },
    React.createElement("video", {
      ref: videoRef,
      autoPlay: true,
      muted: true,
      playsInline: true,
      style: styles.video,
    }),
    statusMessage
      ? React.createElement(
          View,
          { style: styles.messageContainer },
          React.createElement(Text, { style: styles.messageTitle }, "Camera unavailable"),
          React.createElement(Text, { style: styles.messageText }, statusMessage),
        )
      : null,
    !isVideoReady && !statusMessage
      ? React.createElement(
          View,
          { style: styles.messageContainer },
          React.createElement(Text, { style: styles.messageText }, "Opening camera..."),
        )
      : null,
    children,
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  messageContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  messageText: {
    color: "#d4d4d4",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  messageTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  video: {
    bottom: 0,
    height: "100%",
    left: 0,
    objectFit: "cover",
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
  },
});
