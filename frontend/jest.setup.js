// Jest setup for Expo + React Native

// FIX 1: Define EXPO_OS explicitly (Mandatory)
process.env.EXPO_OS = "ios";
process.env.EXPO_PLATFORM = "ios";

// Some Expo internals still probe `window` even under the RN preset.
if (!global.window) {
  global.window = global;
}

if (!global.window.addEventListener) {
  global.window.addEventListener = jest.fn();
}

if (!global.window.removeEventListener) {
  global.window.removeEventListener = jest.fn();
}

// Fix for "The global process.env.EXPO_OS is not defined" warning (redundant but safe)
if (!process.env.EXPO_OS) {
  process.env.EXPO_OS = "ios";
}

// Testing Library matchers for React Native
require("@testing-library/jest-native/extend-expect");

// React 19 compatibility fixes
global.React = require("react");

// FIX 2: Mock Expo Modules (Hard Isolation)
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({
    success: true,
  })),
}));

jest.mock("expo-constants", () => ({
  expoConfig: {
    extra: {},
  },
}));

jest.mock("expo-crypto", () => ({
  randomBytes: jest.fn(() => ({
    __b: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  })),
}));

// FIX 4: Enforce AsyncStorage Mock Order (before any imports)
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// FIX 3: Mock ConnectionManager to prevent initialization during tests
jest.mock("./src/services/connectionManager", () => ({
  default: {
    getInstance: jest.fn(() => ({
      isHealthy: true,
      backendUrl: "http://mock:8001",
      backendPort: 8001,
      backendIp: "mock",
      lastChecked: new Date().toISOString(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
  ConnectionManager: {
    getInstance: jest.fn(() => ({
      isHealthy: true,
      backendUrl: "http://mock:8001",
      backendPort: 8001,
      backendIp: "mock",
      lastChecked: new Date().toISOString(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      initialize: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, {}, children),
    SafeAreaView: ({ children, style }) =>
      React.createElement(View, { style }, children),
    useSafeAreaInsets: () => inset,
    initialWindowMetrics: {
      frame: { x: 0, y: 0, width: 0, height: 0 },
      insets: inset,
    },
  };
});

// Mock react-native-mmkv to avoid NitroModules error
jest.mock("react-native-mmkv", () => ({
  createMMKV: jest.fn(() => ({
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(() => []),
    contains: jest.fn(() => false),
  })),
}), { virtual: true });

// Mock SecureStore to avoid native module dependencies in unit tests
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  Stack: {
    Screen: jest.fn(() => null),
  },
  Link: jest.fn(({ children }) => children),
}));

// Mock expo-linear-gradient
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }) => children,
}));

// Mock expo-blur
jest.mock("expo-blur", () => ({
  BlurView: ({ children }) => children,
}));

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock("expo-notifications", () => {
  const getPermissionsAsync = jest.fn(async () => ({
    status: "granted",
    granted: true,
    canAskAgain: true,
  }));
  const requestPermissionsAsync = jest.fn(async () => ({
    status: "granted",
    granted: true,
    canAskAgain: true,
  }));
  const scheduleNotificationAsync = jest.fn(async () => "mock-notification-id");
  const cancelScheduledNotificationAsync = jest.fn(async () => undefined);
  const cancelAllScheduledNotificationsAsync = jest.fn(async () => undefined);
  const setBadgeCountAsync = jest.fn(async () => undefined);
  const setNotificationChannelAsync = jest.fn(async () => undefined);
  const setNotificationHandler = jest.fn();
  const getExpoPushTokenAsync = jest.fn(async () => ({
    data: "ExponentPushToken[mock]",
  }));

  const notificationsModule = {
    getPermissionsAsync,
    requestPermissionsAsync,
    scheduleNotificationAsync,
    cancelScheduledNotificationAsync,
    cancelAllScheduledNotificationsAsync,
    setBadgeCountAsync,
    setNotificationChannelAsync,
    setNotificationHandler,
    getExpoPushTokenAsync,
    addNotificationReceivedListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    addNotificationResponseReceivedListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    removeNotificationSubscription: jest.fn(),
    dismissNotificationAsync: jest.fn(async () => undefined),
    dismissAllNotificationsAsync: jest.fn(async () => undefined),
    getBadgeCountAsync: jest.fn(async () => 0),
  };

  return {
    __esModule: true,
    default: notificationsModule,
    ...notificationsModule,
    AndroidImportance: {
      DEFAULT: "default",
      HIGH: "high",
      MAX: "max",
    },
    SchedulableTriggerInputTypes: {
      DATE: "date",
      TIME_INTERVAL: "timeInterval",
      CALENDAR: "calendar",
      DAILY: "daily",
      WEEKLY: "weekly",
      MONTHLY: "monthly",
      YEARLY: "yearly",
    },
  };
});

// Newer reanimated builds depend on worklets, but older worklets releases do
// not ship a dedicated Jest mock. Keep the mock inline and version-agnostic.
jest.mock("react-native-worklets", () => {
  const asCallable = (fn) =>
    typeof fn === "function" ? (...args) => fn(...args) : () => fn;
  const identity = (value) => value;

  const workletsModule = {
    installTurboModule: jest.fn(),
  };

  const base = {
    __esModule: true,
    WorkletsModule: workletsModule,
    callMicrotasks: jest.fn(),
    createSerializable: jest.fn(identity),
    createSynchronizable: jest.fn(identity),
    createWorkletRuntime: jest.fn(() => ({})),
    executeOnUIRuntimeSync: jest.fn((fn) => asCallable(fn)),
    getRuntimeKind: jest.fn(() => "rn"),
    isSerializableRef: jest.fn(() => false),
    isSynchronizable: jest.fn(() => false),
    isWorkletFunction: jest.fn((value) => typeof value === "function"),
    makeShareable: jest.fn(identity),
    makeShareableCloneOnUIRecursive: jest.fn(identity),
    makeShareableCloneRecursive: jest.fn(identity),
    runOnJS: jest.fn((fn) => asCallable(fn)),
    runOnRuntime: jest.fn((_runtime, fn) => asCallable(fn)),
    runOnUI: jest.fn((fn) => asCallable(fn)),
    runOnUIAsync: jest.fn((fn) => async (...args) => fn?.(...args)),
    runOnUISync: jest.fn((fn) => asCallable(fn)),
    RuntimeKind: {
      JS: "js",
      RN: "rn",
      UI: "ui",
    },
    scheduleOnRN: jest.fn((fn) => fn?.()),
    scheduleOnUI: jest.fn((fn) => fn?.()),
    serializableMappingCache: new Map(),
    shareableMappingCache: new Map(),
    unstable_eventLoopTask: jest.fn(),
  };

  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      return jest.fn();
    },
  });
});

// Mock react-native-reanimated
jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock @expo/vector-icons
jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
  MaterialIcons: "MaterialIcons",
  FontAwesome: "FontAwesome",
}));

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const MockIcon = ({ children, ...props }) =>
    React.createElement("Ionicons", props, children);
  MockIcon.displayName = "Ionicons";
  MockIcon.glyphMap = {};

  return {
    __esModule: true,
    default: MockIcon,
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const React = require("react");
  const MockIcon = ({ children, ...props }) =>
    React.createElement("MaterialCommunityIcons", props, children);
  MockIcon.displayName = "MaterialCommunityIcons";
  MockIcon.glyphMap = {};

  return {
    __esModule: true,
    default: MockIcon,
  };
});

// Mock react-native-svg
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props) => React.createElement(View, props),
    Circle: (props) => React.createElement(View, props),
    Line: (props) => React.createElement(View, props),
    Path: (props) => React.createElement(View, props),
    Defs: (props) => React.createElement(View, props),
    Pattern: (props) => React.createElement(View, props),
    Rect: (props) => React.createElement(View, props),
    LinearGradient: (props) => React.createElement(View, props),
    Stop: (props) => React.createElement(View, props),
    Svg: (props) => React.createElement(View, props),
  };
});

// FIX 5: Silence Logs Intentionally (Not Blanket)
beforeAll(() => {
  const originalWarn = console.warn.bind(console);
  jest.spyOn(console, "warn").mockImplementation((msg, ...args) => {
    if (
      typeof msg === "string" &&
      msg.includes("EXPO_OS is not defined")
    ) {
      return;
    }
    originalWarn(msg, ...args);
  });
});

// Mock Modal component to avoid "window is not defined" error in tests
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockModal = ({ children, visible, ...props }) => {
    if (!visible) return null;
    return React.createElement(
      View,
      { testID: "modal", ...props },
      children,
    );
  };
  MockModal.displayName = "Modal";
  return {
    __esModule: true,
    default: MockModal,
  };
});
