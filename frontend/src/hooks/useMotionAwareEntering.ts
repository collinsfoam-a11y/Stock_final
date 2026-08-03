/**
 * useMotionAwareEntering — motion-disciplined Reanimated entering helper (P3 / §8).
 *
 * Centralizes the `reducedMotion ? undefined : FadeInDown…` pattern that is
 * otherwise scattered across screens. Returns a Reanimated `entering` value, or
 * `undefined` (the static fallback) when the user has reduced-motion enabled OR
 * the active theme has motion disabled. This guarantees every entering
 * animation has a no-motion path (proposal §9, OXS §8.1).
 *
 * Only opacity/transform-based built-ins are used (FadeInDown) — never layout
 * properties (§8.3 prohibition).
 */

import { FadeInDown } from "react-native-reanimated";

import { useReducedMotion } from "./useReducedMotion";
import { useUiTokens } from "./useUiTokens";
import { getOperationalMotionDuration, type OperationalMotionKey } from "@/utils/motion";

export interface MotionEnteringConfig {
  /** Stagger delay in ms. */
  delay?: number;
  /** Duration bucket; defaults to "normal". */
  durationKey?: OperationalMotionKey;
}

/**
 * @returns a Reanimated entering animation, or `undefined` for the static path.
 */
export function useMotionAwareEntering(config: MotionEnteringConfig = {}) {
  const reducedMotion = useReducedMotion();
  const tokens = useUiTokens();
  const { delay = 0, durationKey = "normal" } = config;

  const duration = getOperationalMotionDuration(tokens, durationKey, reducedMotion);
  if (duration <= 0) return undefined;

  return FadeInDown.delay(delay).duration(duration);
}
