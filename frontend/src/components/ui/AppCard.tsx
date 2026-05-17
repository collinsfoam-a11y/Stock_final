import React from "react";

import ModernCard from "./ModernCard";

type ModernCardProps = React.ComponentProps<typeof ModernCard>;

export type AppCardVariant = "default" | "outlined" | "elevated";

export interface AppCardProps extends Omit<ModernCardProps, "variant" | "gradientColors"> {
  variant?: AppCardVariant;
}

export function AppCard({ variant = "default", elevation = "sm", ...props }: AppCardProps) {
  return <ModernCard {...props} elevation={elevation} variant={variant} />;
}

export default AppCard;
