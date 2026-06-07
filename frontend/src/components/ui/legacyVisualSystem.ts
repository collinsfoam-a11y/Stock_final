import { logger } from '@/services/logging';
type LegacyClassification = "removable" | "wrapper-only" | "migration-required" | "approved-exception";

export type LegacyVisualSystemEntry = {
  classification: LegacyClassification;
  replacement: string;
  guidance: string;
};

export const legacyVisualSystemRegistry = {
  auroraTheme: {
    classification: "migration-required",
    replacement: "useUiTokens or themeTokens",
    guidance: "Theme values must move through semantic tokens before direct usage is removed.",
  },
  legacyCompat: {
    classification: "wrapper-only",
    replacement: "useUiTokens or themeTokens",
    guidance: "Allowed only as a bridge for old theme consumers during migration.",
  },
  PremiumButton: {
    classification: "wrapper-only",
    replacement: "AppButton",
    guidance: "Use AppButton for new work. PremiumButton is a compatibility adapter.",
  },
  PremiumCard: {
    classification: "wrapper-only",
    replacement: "AppCard",
    guidance: "Use AppCard for new work. PremiumCard is a compatibility adapter.",
  },
  PremiumInput: {
    classification: "wrapper-only",
    replacement: "AppInput",
    guidance: "Use AppInput for new work. PremiumInput is a compatibility adapter.",
  },
  GlassCard: {
    classification: "approved-exception",
    replacement: "AppCard",
    guidance: "Allowed only in appearance/demo surfaces while migration is in progress.",
  },
  EnhancedButton: {
    classification: "wrapper-only",
    replacement: "AppButton",
    guidance: "Use AppButton for new work. EnhancedButton remains only for legacy compatibility.",
  },
  EnhancedInput: {
    classification: "wrapper-only",
    replacement: "AppInput",
    guidance: "Use AppInput for new work. EnhancedInput remains only for legacy compatibility.",
  },
  RippleButton: {
    classification: "wrapper-only",
    replacement: "AppButton",
    guidance: "Use AppButton for new work. RippleButton remains only for legacy compatibility.",
  },
  AuroraBackground: {
    classification: "approved-exception",
    replacement: 'ScreenContainer backgroundType="solid"',
    guidance: "Operational screens must not use aurora backgrounds.",
  },
  ParticleField: {
    classification: "removable",
    replacement: "No replacement in operational UI",
    guidance: "Particles are decorative and are not approved for operational workflows.",
  },
  PatternBackground: {
    classification: "approved-exception",
    replacement: 'ScreenContainer backgroundType="solid"',
    guidance: "Allowed only in appearance/demo surfaces while migration is in progress.",
  },
} satisfies Record<string, LegacyVisualSystemEntry>;

const warnedKeys = new Set<string>();

export function warnDeprecatedVisualSystem(componentName: keyof typeof legacyVisualSystemRegistry) {
  if (!__DEV__ || warnedKeys.has(componentName)) return;
  warnedKeys.add(componentName);

  const entry = legacyVisualSystemRegistry[componentName];
  logger.warn(
    `[UI governance] ${componentName} is deprecated (${entry.classification}). ` +
      `Use ${entry.replacement}. ${entry.guidance}`
  );
}
