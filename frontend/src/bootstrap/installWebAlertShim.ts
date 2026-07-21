import { Alert, Platform, type AlertButton, type AlertOptions } from "react-native";

import { toastService } from "@/services/toastService";

/**
 * React Native Web ships Alert.alert as a no-op, so every validation or
 * confirmation dialog silently disappears on web and flows dead-end.
 *
 * Informational alerts (zero or one button) become non-blocking toasts —
 * a native window.alert would freeze the whole page, which is especially
 * hostile when background errors fire it. Only genuine decisions (two or
 * more buttons) use window.confirm.
 */
export function installWebAlertShim(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;

  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    _options?: AlertOptions
  ): void => {
    const text = [title, message].filter(Boolean).join("\n");

    if (!buttons || buttons.length <= 1) {
      toastService.show(text, { type: "warning", duration: "long" });
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancelButton = buttons.find((b) => b.style === "cancel") ?? buttons[0];

    if (buttons.length > 2) {
      const optionsList = buttons
        .map((b, idx) => `${idx + 1}. ${b.text ?? "Option"}`)
        .join("\n");
      const choice = window.prompt(`${text}\n\nEnter a choice number:\n${optionsList}`);
      if (choice !== null) {
        const selectedIndex = parseInt(choice.trim(), 10) - 1;
        if (!isNaN(selectedIndex) && buttons[selectedIndex]) {
          buttons[selectedIndex].onPress?.();
          return;
        }
      }
      cancelButton?.onPress?.();
      return;
    }

    const confirmButton = buttons.find((b) => b !== cancelButton) ?? buttons[buttons.length - 1];

    if (window.confirm(text)) {
      confirmButton?.onPress?.();
    } else {
      cancelButton?.onPress?.();
    }
  };
}
