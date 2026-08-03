import type { ThemeTokens } from "@/theme/themeTokens";

export const operationalMotion = {
  instant: 100,
  fast: 150,
  normal: 200,
  slow: 300,
  maxRoutine: 350,
} as const;

export type OperationalMotionKey = keyof typeof operationalMotion;

export function getOperationalMotionDuration(
  tokens: ThemeTokens | null | undefined,
  key: OperationalMotionKey,
  reducedMotion: boolean
) {
  if (reducedMotion || tokens?.motion.enabled === false) {
    return 0;
  }

  if (key === "fast") return Math.min(tokens?.motion.fast ?? operationalMotion.fast, 150);
  if (key === "normal") return Math.min(tokens?.motion.normal ?? operationalMotion.normal, 200);
  if (key === "slow") return Math.min(tokens?.motion.slow ?? operationalMotion.slow, 300);

  return operationalMotion[key];
}
