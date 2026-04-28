import React from "react";
import { AccessibilityInfo, Platform } from "react-native";

const WEB_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [reducedMotionEnabled, setReducedMotionEnabled] = React.useState(false);

  React.useEffect(() => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      const mediaQuery = window.matchMedia(WEB_MEDIA_QUERY);
      const handleChange = (event: { matches: boolean }) => {
        setReducedMotionEnabled(event.matches);
      };

      setReducedMotionEnabled(mediaQuery.matches);

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      }

      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setReducedMotionEnabled(enabled);
        }
      })
      .catch(() => {
        if (isMounted) {
          setReducedMotionEnabled(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setReducedMotionEnabled(enabled);
      },
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotionEnabled;
}

export default useReducedMotion;
