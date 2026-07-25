import React from "react";
import { Link, Stack, usePathname, useRouter } from "expo-router";
import { StyleSheet, View, Text } from "react-native";

import { semanticColors, colors } from "@/theme/legacyCompat";
export default function NotFoundScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const isEmptyStartupLink = !pathname || /^\/+$/.test(pathname);

  React.useEffect(() => {
    if (isEmptyStartupLink) {
      router.replace("/");
    }
  }, [isEmptyStartupLink, router]);

  if (isEmptyStartupLink) {
    return null;
  }

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
    padding: 20,
    backgroundColor: colors.neutral[950],
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: semanticColors.text.inverse,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: colors.success[500],
  },
});
