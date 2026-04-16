import { withTimeout } from "./withTimeout";

export async function initBackendURL(timeoutMs: number = 5000): Promise<void> {
  await withTimeout(
    (async () => {
      const { initializeBackendURL } = await import("../utils/backendUrl");
      const url = await initializeBackendURL();
      if (url) {
        const { updateBaseURL } = await import("../services/httpClient");
        updateBaseURL(url);
      }
    })(),
    timeoutMs,
    "Backend URL initialization timeout",
  );
}

