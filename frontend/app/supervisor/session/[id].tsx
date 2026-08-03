import React, { Suspense } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

const LazySessionDetailScreen = React.lazy(
  () => import("../../../src/screens/supervisor/SessionDetailScreen"),
);

export default function SessionDetailRoute() {
  if (process.env.NODE_ENV === "test") {
    // Keep direct sync rendering in Jest so route-level tests stay deterministic.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require("../../../src/screens/supervisor/SessionDetailScreen")
      .default as React.ComponentType;
    return <Screen />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <LazySessionDetailScreen />
    </Suspense>
  );
}

function RouteFallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
