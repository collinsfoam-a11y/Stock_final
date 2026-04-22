import React from "react";
import {
  Image,
  type ImageStyle,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

type BrandLogoVariant = "wordmark" | "wordmarkTagline" | "symbol" | "icon";

const SOURCES = {
  icon: {
    source: require("../../../assets/images/brand-icon.png"),
    width: 1024,
    height: 1024,
  },
  symbol: {
    source: require("../../../assets/images/brand-symbol.png"),
    width: 500,
    height: 480,
  },
  wordmark: {
    source: require("../../../assets/images/brand-wordmark.png"),
    width: 1320,
    height: 560,
  },
  wordmarkTagline: {
    source: require("../../../assets/images/brand-wordmark-tagline.png"),
    width: 2280,
    height: 660,
  },
} as const;

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  width?: number;
  height?: number;
  maxWidth?: number;
  maxHeight?: number;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
}

export function BrandLogo({
  variant = "wordmark",
  width,
  height,
  maxWidth,
  maxHeight,
  style,
  containerStyle,
}: BrandLogoProps) {
  const sourceConfig = SOURCES[variant];
  const { source } = sourceConfig;
  const aspectRatio = sourceConfig.width / sourceConfig.height;

  const getDimensions = () => {
    if (width && height) {
      return { width, height };
    }
    if (width) {
      return { width, height: width / aspectRatio };
    }
    if (height) {
      return { width: height * aspectRatio, height };
    }

    const boundedWidth = maxWidth ?? sourceConfig.width;
    const boundedHeight = maxHeight ?? sourceConfig.height ?? boundedWidth / aspectRatio;
    const widthLimitedHeight = boundedWidth / aspectRatio;

    if (widthLimitedHeight <= boundedHeight) {
      return { width: boundedWidth, height: widthLimitedHeight };
    }

    return { width: boundedHeight * aspectRatio, height: boundedHeight };
  };

  const dimensions = getDimensions();

  return (
    <View
      style={[
        styles.container,
        dimensions,
        containerStyle,
      ]}
    >
      <Image
        source={source}
        style={[styles.image, dimensions, style]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
