/**
 * Action sheet / confirmation service
 *
 * Apple HIG: an alert interrupts to report something the user must deal with.
 * A choice the user initiated - sign out, delete a session, discard a count -
 * belongs in an action sheet, anchored to the action they just tapped, with the
 * destructive option shown in red.
 *
 * This service picks the right presentation per platform:
 *   - iOS      -> `ActionSheetIOS`
 *   - Android  -> `Alert.alert` (the platform-idiomatic dialog)
 *   - Web      -> `window.confirm` for confirmations, `Alert.alert` otherwise
 *
 * Callers get one API and no `Platform.OS` branching at the call site.
 */

import { ActionSheetIOS, Alert, Platform } from "react-native";

export interface ConfirmOptions {
  /** Short title. On iOS this is the action sheet title. */
  title: string;
  /** Optional supporting sentence. Keep it to one line. */
  message?: string;
  /** Label for the confirming action, e.g. "Sign Out", "Delete Session". */
  confirmLabel: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Renders the confirming action in red and marks it destructive. */
  destructive?: boolean;
}

export interface ActionSheetChoice {
  label: string;
  onPress: () => void | Promise<void>;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  choices: ActionSheetChoice[];
  cancelLabel?: string;
}

const isWeb = () => Platform.OS === "web" && typeof window !== "undefined";

/**
 * Ask the user to confirm a single action. Resolves `true` when confirmed.
 *
 *   if (await confirmAction({ title: "Sign Out", confirmLabel: "Sign Out", destructive: true })) {
 *     await logout();
 *   }
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (isWeb()) {
    const prompt = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(prompt));
  }

  if (Platform.OS === "ios") {
    return new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [cancelLabel, confirmLabel],
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructive ? 1 : undefined,
          userInterfaceStyle: undefined,
        },
        (buttonIndex) => resolve(buttonIndex === 1),
      );
    });
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}

/**
 * Present a list of choices. Use for two or more actions on the same object;
 * for a single yes/no use {@link confirmAction}.
 */
export function showActionSheet({
  title,
  message,
  choices,
  cancelLabel = "Cancel",
}: ActionSheetOptions): void {
  const enabled = choices.filter((choice) => !choice.disabled);
  if (enabled.length === 0) return;

  if (Platform.OS === "ios" && !isWeb()) {
    const destructiveIndex = enabled.findIndex((choice) => choice.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [cancelLabel, ...enabled.map((choice) => choice.label)],
        cancelButtonIndex: 0,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex + 1 : undefined,
      },
      (buttonIndex) => {
        if (buttonIndex === 0) return;
        void enabled[buttonIndex - 1]?.onPress();
      },
    );
    return;
  }

  Alert.alert(title ?? "", message, [
    { text: cancelLabel, style: "cancel" },
    ...enabled.map((choice) => ({
      text: choice.label,
      style: choice.destructive ? ("destructive" as const) : ("default" as const),
      onPress: () => void choice.onPress(),
    })),
  ]);
}
