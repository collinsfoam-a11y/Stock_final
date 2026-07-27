import React from 'react';

export type BarcodeScanningResult = {
  data: string;
  type?: string;
};

export const useCameraPermission = () => {
  const [granted, setGranted] = React.useState(false);
  const requestPermission = async () => setGranted(true);
  return { hasPermission: granted, requestPermission };
};

export const useCameraDevice = (_?: string) => undefined as any;
export const useCodeScanner = (_?: any) => ({});

const Camera = (_props: any) => null;

export { Camera };
