import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";

const IndexScreen = React.lazy(() =>
  (Platform.OS === "web"
    ? import("../src/screens/routes/IndexScreen.web")
    : import("../src/screens/routes/IndexScreen.native")
  ).then((module) => ({ default: module.IndexScreen })),
);

export default function Index() {
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <IndexScreen />
    </React.Suspense>
  );
}

function RouteFallback() {
  return (
    <View style={styles.fallback}>
      <ActivityIndicator size="small" color="#0f766e" />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f7f6",
  },
});
