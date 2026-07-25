import React, { Suspense } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

const LazyStaffHomeScreen = React.lazy(
  () => import("@/screens/staff/StaffHomeScreen"),
);

export default function StaffHomeRoute() {
  if (process.env.NODE_ENV === "test") {
    // Keep direct sync rendering in Jest so existing screen tests remain stable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Screen = require("@/screens/staff/StaffHomeScreen")
      .default as React.ComponentType;
    return <Screen />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <LazyStaffHomeScreen />
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
