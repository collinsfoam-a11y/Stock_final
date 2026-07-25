/**
 * AppIcon
 *
 * Renders SF Symbols on iOS and Ionicons everywhere else.
 *
 * SF Symbols are Apple's system icon set (shipped with the design resources at
 * https://developer.apple.com/design/resources/). They match the system font's
 * weight and optical alignment, so an iOS build reads as native instead of as a
 * ported Android app.
 *
 * Usage is a drop-in for `<Ionicons name=... size=... color=... />`:
 *
 *   <AppIcon name="chevron-forward" size={20} color={tokens.colors.textMuted} />
 *
 * Names not present in `IONICON_TO_SF_SYMBOL` fall back to Ionicons on every
 * platform, so partial migration is safe.
 */

import React from "react";
import { Platform, type ColorValue } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SymbolView, type SFSymbol, type SymbolWeight } from "expo-symbols";

export type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Ionicons -> SF Symbols. Covers the icons currently used in the app; extend as
 * screens are migrated. Keep both sides semantically identical - do not map an
 * icon to a symbol that means something different on iOS.
 */
export const IONICON_TO_SF_SYMBOL: Partial<Record<string, SFSymbol>> = {
  // Navigation
  "arrow-back": "chevron.left",
  "arrow-forward": "chevron.right",
  "chevron-back": "chevron.left",
  "chevron-forward": "chevron.right",
  "chevron-down": "chevron.down",
  "chevron-up": "chevron.up",
  close: "xmark",
  "close-circle": "xmark.circle.fill",
  menu: "line.3.horizontal",
  "ellipsis-horizontal": "ellipsis",

  // Status
  checkmark: "checkmark",
  "checkmark-circle": "checkmark.circle.fill",
  "checkmark-circle-outline": "checkmark.circle",
  "alert-circle": "exclamationmark.circle.fill",
  "alert-circle-outline": "exclamationmark.circle",
  warning: "exclamationmark.triangle.fill",
  "warning-outline": "exclamationmark.triangle",
  "information-circle": "info.circle.fill",
  "information-circle-outline": "info.circle",
  "shield-checkmark": "checkmark.shield.fill",
  "shield-checkmark-outline": "checkmark.shield",

  // Sync / connectivity
  refresh: "arrow.clockwise",
  "refresh-outline": "arrow.clockwise",
  sync: "arrow.triangle.2.circlepath",
  "cloud-offline-outline": "icloud.slash",
  "cloud-done-outline": "checkmark.icloud",
  pulse: "waveform.path.ecg",

  // Inventory domain
  "cube-outline": "shippingbox",
  cube: "shippingbox.fill",
  "barcode-outline": "barcode",
  barcode: "barcode",
  "scan-outline": "viewfinder",
  scan: "viewfinder",
  "scan-circle-outline": "viewfinder.circle",
  "pricetag-outline": "tag",
  pricetag: "tag.fill",
  "file-tray-outline": "tray",
  "location-outline": "mappin.and.ellipse",
  location: "mappin.and.ellipse",
  "layers-outline": "square.3.layers.3d",
  "grid-outline": "square.grid.2x2",

  // People
  person: "person.fill",
  "person-outline": "person",
  "person-circle-outline": "person.crop.circle",
  people: "person.2.fill",
  "people-outline": "person.2",

  // Actions
  add: "plus",
  "add-circle-outline": "plus.circle",
  remove: "minus",
  "remove-circle": "minus.circle.fill",
  "remove-circle-outline": "minus.circle",
  search: "magnifyingglass",
  "search-outline": "magnifyingglass",
  "trash-outline": "trash",
  trash: "trash.fill",
  "save-outline": "square.and.arrow.down",
  save: "square.and.arrow.down.fill",
  "share-outline": "square.and.arrow.up",
  "log-out-outline": "rectangle.portrait.and.arrow.right",
  play: "play.fill",
  pause: "pause.fill",

  // Content
  "document-text-outline": "doc.text",
  "document-text": "doc.text.fill",
  "analytics-outline": "chart.bar",
  analytics: "chart.bar.fill",
  "settings-outline": "gearshape",
  settings: "gearshape.fill",
  "time-outline": "clock",
  time: "clock.fill",
  calendar: "calendar",
  "camera-outline": "camera",
  camera: "camera.fill",
  "finger-print": "touchid",
  "server-outline": "server.rack",
  server: "server.rack",
  "text-outline": "textformat",
  text: "textformat",
  "notifications-outline": "bell",
  notifications: "bell.fill",
  "home-outline": "house",
  home: "house.fill",
  "lock-closed-outline": "lock",
  "lock-closed": "lock.fill",
  "eye-outline": "eye",
  "eye-off-outline": "eye.slash",
  "mail-outline": "envelope",
  "help-circle-outline": "questionmark.circle",
  "list-outline": "list.bullet",
  "filter-outline": "line.3.horizontal.decrease",
};

export interface AppIconProps {
  /** Ionicons glyph name. Mapped to an SF Symbol on iOS when a mapping exists. */
  name: IoniconName | string;
  size?: number;
  color?: ColorValue;
  /** SF Symbol weight (iOS only). Match the weight of adjacent text. */
  weight?: SymbolWeight;
  /** Explicit SF Symbol override when the shared mapping is not the right fit. */
  sfSymbol?: SFSymbol;
  testID?: string;
  /**
   * Decorative icons should stay hidden from screen readers; the surrounding
   * control carries the label.
   */
  accessibilityLabel?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 24,
  color,
  weight = "regular",
  sfSymbol,
  testID,
  accessibilityLabel,
}) => {
  const symbol = sfSymbol ?? IONICON_TO_SF_SYMBOL[name];

  const fallback = (
    <Ionicons
      name={name as IoniconName}
      size={size}
      color={color as string}
      testID={testID}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no-hide-descendants"}
      accessibilityLabel={accessibilityLabel}
    />
  );

  if (Platform.OS !== "ios" || !symbol) {
    return fallback;
  }

  return (
    <SymbolView
      name={symbol}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      fallback={fallback}
      testID={testID}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? "yes" : "no-hide-descendants"}
      accessibilityLabel={accessibilityLabel}
    />
  );
};

export default AppIcon;
