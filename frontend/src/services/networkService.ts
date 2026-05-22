import NetInfo from "@react-native-community/netinfo";
import { flags } from "../constants/flags";
import { useNetworkStore } from "../store/networkStore";

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
  const store = useNetworkStore.getState();
  const isConnected =
    typeof state.isConnected === "boolean"
      ? state.isConnected
      : store.isOnline;
  const reachable =
    typeof state.isConnected === "boolean"
      ? toReachableValue(isConnected, state.isInternetReachable)
      : store.isInternetReachable;
  const type = state.type ?? store.connectionType ?? "unknown";

  store.setIsOnline(isConnected);
  store.setConnectionType(type);
  store.setIsInternetReachable(reachable);

  // When the network changes, clear restricted mode so the app can re-check.
  // Restricted mode will be re-enabled by the API interceptor if still applicable.
  store.setRestrictedMode(false);

  if (flags.enableNetworkLogging) {
    // Keep logs minimal in production.
    console.log("[NetInfo]", {
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
