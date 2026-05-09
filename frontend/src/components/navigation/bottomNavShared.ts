import Ionicons from "@expo/vector-icons/Ionicons";
import { colors as unifiedColors } from "@/theme/legacyCompat";

export type NavTabId = "home" | "inventory" | "review" | "finish" | string;

export interface NavTab {
  id: NavTabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  activeColor?: string;
}

export const BOTTOM_NAV_HIT_SLOP = {
  top: 12,
  bottom: 12,
  left: 12,
  right: 12,
} as const;

const MIN_TOUCH_TARGET = 44;
const PHONE_TAB_TARGET = 64;
const TABLET_TAB_TARGET = 72;
const WEB_TAB_TARGET = 56;
const HORIZONTAL_SAFE_PADDING = 32;

export const getResponsiveBottomNavTabMinWidth = (
  screenWidth: number,
  tabCount: number,
  platformOS: string
): number => {
  const safeWidth = Number.isFinite(screenWidth) && screenWidth > 0 ? screenWidth : 360;
  const safeTabCount = Math.max(1, tabCount);
  const platformTarget =
    platformOS === "web" ? WEB_TAB_TARGET : safeWidth >= 768 ? TABLET_TAB_TARGET : PHONE_TAB_TARGET;
  const availablePerTab = Math.floor(
    Math.max(MIN_TOUCH_TARGET, safeWidth - HORIZONTAL_SAFE_PADDING) / safeTabCount
  );

  return Math.max(MIN_TOUCH_TARGET, Math.min(platformTarget, availablePerTab));
};

export const getDefaultInventoryTabs = (
  router: { push: (path: string) => void },
  sessionId: string | null,
  onFinish: () => void
): NavTab[] => {
  const reviewRoute = sessionId
    ? `/staff/history?sessionId=${encodeURIComponent(sessionId)}`
    : "/staff/history";

  return [
    {
      id: "home",
      label: "Home",
      icon: "home-outline",
      iconFilled: "home",
      onPress: () => router.push("/staff/home"),
    },
    {
      id: "inventory",
      label: "Inventory",
      icon: "barcode-outline",
      iconFilled: "barcode",
      onPress: () => {},
    },
    {
      id: "review",
      label: "Review",
      icon: "clipboard-outline",
      iconFilled: "clipboard",
      onPress: () => router.push(reviewRoute),
    },
    {
      id: "finish",
      label: "Finish",
      icon: "checkmark-circle-outline",
      iconFilled: "checkmark-circle",
      onPress: onFinish,
      activeColor: unifiedColors.success[500],
    },
  ];
};
