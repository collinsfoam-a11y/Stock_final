import React from "react";

import ModernButton, { type ModernButtonProps } from "./ModernButton";

// Re-export ModernButtonProps so consumers can import it from AppButton if needed.
export type { ModernButtonProps };

export type AppButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type AppButtonSize = NonNullable<ModernButtonProps["size"]>;

/**
 * AppButtonProps maps AppButton's variant vocabulary onto ModernButton's props.
 * Consumers that already depend on AppButtonProps can continue to use it; the
 * underlying implementation delegates entirely to ModernButton.
 */
export interface AppButtonProps
  extends Omit<ModernButtonProps, "variant" | "gradientColors" | "size"> {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
}

const variantMap: Record<AppButtonVariant, NonNullable<ModernButtonProps["variant"]>> = {
  primary: "primary",
  secondary: "secondary",
  tertiary: "ghost",
  destructive: "danger",
};

export function AppButton({ variant = "primary", size = "medium", ...props }: AppButtonProps) {
  return <ModernButton {...props} size={size} variant={variantMap[variant]} />;
}

export default AppButton;
