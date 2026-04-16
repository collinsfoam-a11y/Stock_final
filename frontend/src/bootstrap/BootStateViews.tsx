import React from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import {
  modernColors,
  modernTypography,
} from "../styles/modernDesignSystem";
import { BrandLogo } from "../components/branding/BrandLogo";

interface BootLoadingViewProps {
  initError: string | null;
}

export function BootLoadingView({ initError }: BootLoadingViewProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: modernColors.background.primary,
      }}
    >
      <ActivityIndicator
        color={modernColors.primary[500]}
        style={{ marginBottom: 24 }}
        size="large"
      />
      <BrandLogo variant="wordmark" maxWidth={220} maxHeight={90} />
      <Text
        style={{
          color: modernColors.text.primary,
          fontSize: modernTypography.h3.fontSize,
          fontWeight: "700",
          letterSpacing: 0.5,
          marginTop: 20,
        }}
      >
        {Platform.OS === "web" ? "Lavanya Mart Admin" : "Lavanya Mart"}
      </Text>
      <Text
        style={{
          color: modernColors.text.tertiary,
          fontSize: modernTypography.body.small.fontSize,
          marginTop: 8,
          letterSpacing: 0.5,
        }}
      >
        Initializing Secure Session...
      </Text>
      {initError && (
        <View
          style={{
            marginTop: 32,
            padding: 16,
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(239, 68, 68, 0.2)",
            maxWidth: 300,
          }}
        >
          <Text
            style={{
              color: modernColors.error.main,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Warning: {initError}
          </Text>
        </View>
      )}
    </View>
  );
}

interface BootErrorViewProps {
  initError: string;
}

export function BootErrorView({ initError }: BootErrorViewProps) {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: modernColors.background.primary,
        padding: 20,
      }}
    >
      <BrandLogo
        variant="symbol"
        width={72}
        height={72}
        containerStyle={{ marginBottom: 20 }}
      />
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Text style={{ fontSize: 32 }}>⚠️</Text>
      </View>
      <Text
        style={{
          color: modernColors.error.main,
          fontSize: 20,
          fontWeight: "bold",
          marginBottom: 12,
        }}
      >
        Initialization Error
      </Text>
      <Text
        style={{
          color: modernColors.text.tertiary,
          fontSize: 14,
          marginBottom: 32,
          textAlign: "center",
          maxWidth: 400,
          lineHeight: 20,
        }}
      >
        {initError}
      </Text>
      <View
        style={{
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 8,
        }}
      >
        <Text
          style={{
            color: modernColors.primary[500],
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Attempting to continue...
        </Text>
      </View>
    </View>
  );
}

