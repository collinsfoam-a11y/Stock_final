import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { syncQueue } from "./syncQueue";
import { createLogger } from "./logging";

const log = createLogger("backgroundSync");
const BACKGROUND_SYNC_TASK = "BACKGROUND_SYNC_TASK";

/**
 * Define the background task.
 */
if (Platform.OS !== "web" && TaskManager?.defineTask) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      log.info("Background sync task started");
      const result = await syncQueue.performFullSync();
      log.info("Background sync task completed", { result });

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      log.error("Background sync task failed", { error });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * Register the background sync task.
 */
export const registerBackgroundSync = async () => {
  if (Platform.OS === "web" || !TaskManager?.isTaskRegisteredAsync) {
    log.info("Background sync is not supported on web");
    return;
  }

  // Expo Go does not support Background Fetch / TaskManager execution.
  // Avoid surfacing this as a fatal runtime error on physical devices.
  if (Constants.appOwnership === "expo") {
    log.info("Background sync registration skipped in Expo Go");
    return;
  }

  try {
    // On some iOS configurations, background tasks may be restricted.
    // Avoid surfacing this as a fatal runtime error.
    try {
      const taskStatus = await BackgroundTask.getStatusAsync();
      if (taskStatus !== BackgroundTask.BackgroundTaskStatus.Available) {
        log.info(
          "Background tasks not available; skipping background sync registration",
          {
            status: taskStatus,
          },
        );
        return;
      }
    } catch {
      // If status can't be determined, fall through and attempt registration.
    }

    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      log.info("Background sync task already registered");
      return;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15, // minutes
    });

    log.info("Background sync task registered");
  } catch (error) {
    log.error("Failed to register background sync task", { error });
  }
};

/**
 * Unregister the background sync task.
 */
export const unregisterBackgroundSync = async () => {
  if (Platform.OS === "web" || !BackgroundTask?.unregisterTaskAsync) return;

  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    log.info("Background sync task unregistered");
  } catch (error) {
    log.error("Failed to unregister background sync task", { error });
  }
};
