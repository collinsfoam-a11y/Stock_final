import { Link, Stack } from "expo-router";
import { StyleSheet, View, Text } from "react-native";

import { semanticColors, colors, spacing } from "@/theme/legacyCompat";
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.neutral[950],
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: semanticColors.text.inverse,
  },
  link: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
  },
  linkText: {
    fontSize: 14,
    color: colors.success[500],
  },
});
