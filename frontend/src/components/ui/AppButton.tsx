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

export function AppButton({ variant = "primary", size = "medium", ...props }: AppButtonProps) {
  return <ModernButton {...props} size={size} variant={variantMap[variant]} />;
}

export default AppButton;
