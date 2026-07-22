/**
 * @deprecated Use `ModernButton` directly with the appropriate variant prop.
 * This wrapper will be removed in a future release.
 */

import React from "react";

import ModernButton from "./ModernButton";

type ModernButtonProps = React.ComponentProps<typeof ModernButton>;

export type AppButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type AppButtonSize = NonNullable<ModernButtonProps["size"]>;

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

let _deprecatedWarned = false;

export function AppButton({ variant = "primary", size = "medium", ...props }: AppButtonProps) {
  if (__DEV__ && !_deprecatedWarned) {
    _deprecatedWarned = true;
    console.warn(
      "[Stock Verify] AppButton is deprecated. Use ModernButton directly with the appropriate variant prop."
    );
  }
  return <ModernButton {...props} size={size} variant={variantMap[variant]} />;
}

export default AppButton;