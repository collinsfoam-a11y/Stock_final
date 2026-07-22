/**
 * @deprecated Use `ModernInput` directly. It already supports the `icon` prop.
 * This wrapper will be removed in a future release.
 */

import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernInput from "./ModernInput";

export type AppInputProps = React.ComponentProps<typeof ModernInput> & {
  leftIcon?: keyof typeof Ionicons.glyphMap;
};

let _deprecatedWarned = false;

export function AppInput({ leftIcon, icon, ...props }: AppInputProps) {
  if (__DEV__ && !_deprecatedWarned) {
    _deprecatedWarned = true;
    console.warn(
      "[Stock Verify] AppInput is deprecated. Use ModernInput directly."
    );
  }
  return <ModernInput {...props} icon={icon ?? leftIcon} />;
}

export default AppInput;