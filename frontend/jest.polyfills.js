// Ensure React/Jest load test builds even if shell exports NODE_ENV=production
process.env.NODE_ENV = "test";

// Fix for "The global process.env.EXPO_OS is not defined" warning
if (!process.env.EXPO_OS) {
  process.env.EXPO_OS = "ios";
}

try {
  if (typeof window !== "undefined") {
    delete global.window;
  }
} catch { /* ignored */ }
