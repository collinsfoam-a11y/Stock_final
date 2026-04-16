import Ionicons from "@expo/vector-icons/Ionicons";
import { colors as unifiedColors } from "@/theme/unified";

export type NavTabId = "home" | "inventory" | "review" | "finish" | string;

export interface NavTab {
  id: NavTabId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFilled: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  activeColor?: string;
}

export const getDefaultInventoryTabs = (
  router: { push: (path: string) => void },
  sessionId: string | null,
  onFinish: () => void,
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
