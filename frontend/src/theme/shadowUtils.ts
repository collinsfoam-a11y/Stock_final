import { Platform, ViewStyle } from "react-native";

export type CrossPlatformShadowStyle = ViewStyle & {
  boxShadow?: string;
};

type ShadowOptions = {
  color: string;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  radius?: number;
  elevation?: number;
};

const toRgba = (color: string, opacity: number): string => {
  if (opacity <= 0 || color === "transparent") {
    return "transparent";
  }

  if (color.startsWith("rgba(")) {
    return color;
  }

  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`);
  }

  const normalized = color.replace("#", "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;

  if (hex.length === 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return color;
};

export const createShadow = ({
  color,
  offsetX = 0,
  offsetY = 0,
  opacity = 0,
  radius = 0,
  elevation = 0,
}: ShadowOptions): CrossPlatformShadowStyle =>
  Platform.select<CrossPlatformShadowStyle>({
    web: {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px ${toRgba(color, opacity)}`,
    },
    default: {
      shadowColor: color,
      shadowOffset: { width: offsetX, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation,
    },
  }) ?? {};
