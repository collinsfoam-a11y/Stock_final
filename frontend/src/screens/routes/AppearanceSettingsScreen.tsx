import React from "react";
import { StyleSheet, View } from "react-native";

import { AppearanceSettings } from "@/components/ui/AppearanceSettings";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

export default function AppearanceSettingsScreen() {
  return (
    <ScreenContainer
      backgroundType="solid"
      header={{
        title: "Appearance",
        showBackButton: true,
        showLogoutButton: false,
        showUsername: false,
      }}
      contentMode="scroll"
    >
      <View style={styles.content}>
        <AppearanceSettings showTitle={false} scrollable={false} compact={false} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingVertical: 8,
  },
});
