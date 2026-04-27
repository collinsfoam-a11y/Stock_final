import React from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";

const WelcomeScreen = React.lazy(() =>
  (Platform.OS === "web"
    ? import("../src/screens/routes/WelcomeScreen.web")
    : import("../src/screens/routes/WelcomeScreen.native")
  ).then((module) => ({ default: module.WelcomeScreen })),
);

export default function WelcomeRoute() {
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <WelcomeScreen />
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
