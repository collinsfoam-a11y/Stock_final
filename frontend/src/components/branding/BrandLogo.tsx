import React from "react";
import {
  Image,
  type ImageStyle,
  ImageResolvedAssetSource,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

type BrandLogoVariant = "wordmark" | "wordmarkTagline" | "symbol" | "icon";

const SOURCES = {
  icon: require("../../../assets/images/brand-icon.png"),
  symbol: require("../../../assets/images/brand-symbol.png"),
  wordmark: require("../../../assets/images/brand-wordmark.png"),
  wordmarkTagline: require("../../../assets/images/brand-wordmark-tagline.png"),
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
  const source = SOURCES[variant];
  const resolved = Image.resolveAssetSource(source) as ImageResolvedAssetSource;
  const aspectRatio =
    resolved.width && resolved.height ? resolved.width / resolved.height : 1;

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

    const boundedWidth = maxWidth ?? resolved.width ?? 1;
    const boundedHeight = maxHeight ?? resolved.height ?? boundedWidth / aspectRatio;
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
