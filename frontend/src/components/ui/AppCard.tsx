/**
 * @deprecated Use `ModernCard` directly with the appropriate variant prop.
 * This wrapper will be removed in a future release.
 */

import React from "react";

import ModernCard from "./ModernCard";

type ModernCardProps = React.ComponentProps<typeof ModernCard>;

export type AppCardVariant = "default" | "outlined" | "elevated";

export interface AppCardProps extends Omit<ModernCardProps, "variant" | "gradientColors"> {
  variant?: AppCardVariant;
}

let _deprecatedWarned = false;

export function AppCard({ variant = "default", elevation = "sm", ...props }: AppCardProps) {
  if (__DEV__ && !_deprecatedWarned) {
    _deprecatedWarned = true;
    console.warn(
      "[Stock Verify] AppCard is deprecated. Use ModernCard directly with the appropriate variant prop."
    );
  }
  return <ModernCard {...props} elevation={elevation} variant={variant} />;
}

export default AppCard;