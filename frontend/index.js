// Polyfill SharedArrayBuffer for Web browsers where COOP/COEP headers are disabled
if (typeof globalThis !== 'undefined' && typeof globalThis.SharedArrayBuffer === 'undefined') {
  globalThis.SharedArrayBuffer = globalThis.ArrayBuffer;
}

import "react-native-gesture-handler";

import "expo-router/entry";

