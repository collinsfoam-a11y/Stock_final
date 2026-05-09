import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernInput from "./ModernInput";

export type AppInputProps = React.ComponentProps<typeof ModernInput> & {
  leftIcon?: keyof typeof Ionicons.glyphMap;
};

export function AppInput({ leftIcon, icon, ...props }: AppInputProps) {
  return <ModernInput {...props} icon={icon ?? leftIcon} />;
}

export default AppInput;
