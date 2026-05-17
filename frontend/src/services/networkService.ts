import NetInfo from "@react-native-community/netinfo";
import { flags } from "../constants/flags";
import { useNetworkStore } from "../store/networkStore";
import { createLogger } from "./logging";

const logger = createLogger("NetworkService");

function toReachableValue(
  isConnected: boolean,
  isInternetReachable: boolean | null | undefined,
): boolean | null {
  // This app commonly runs on a local LAN backend.
  // NetInfo's `isInternetReachable=false` can mean "no internet" while LAN still works.
  // Treat it as UNKNOWN (null) rather than definitively offline.
  if (!isConnected) return null;
  return isInternetReachable === true ? true : null;
}

function applyNetInfoState(state: {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  type?: string;
}): void {
  const isConnected = state.isConnected ?? false;
  const reachable = toReachableValue(isConnected, state.isInternetReachable);
  const type = state.type ?? "unknown";

  const store = useNetworkStore.getState();
  store.setIsOnline(isConnected);
  store.setConnectionType(type);
  store.setIsInternetReachable(reachable);

  // When the network changes, clear restricted mode so the app can re-check.
  // Restricted mode will be re-enabled by the API interceptor if still applicable.
  store.setRestrictedMode(false);

  if (flags.enableNetworkLogging) {
    logger.debug("NetInfo state changed", {
      isConnected,
      isInternetReachable: state.isInternetReachable,
      normalizedReachable: reachable,
      type,
    });
  }
}

export const initializeNetworkListener = (): (() => void) => {
  // Initialize store from a one-time fetch so we don't depend on the first event.
  NetInfo.fetch()
    .then((state) => applyNetInfoState(state))
    .catch(() => {
      // If NetInfo fails, leave defaults; API layer will degrade gracefully.
    });

  const unsubscribe = NetInfo.addEventListener((state) => {
    applyNetInfoState(state);
  });

  return unsubscribe;
};
