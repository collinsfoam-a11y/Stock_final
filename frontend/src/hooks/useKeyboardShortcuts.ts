import { useEffect } from "react";
import { Platform } from "react-native";

export interface KeyboardShortcut {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  mod?: boolean;
  preventDefault?: boolean;
  ignoreEditableTargets?: boolean;
  ignoreRepeat?: boolean;
  callback: (event: KeyboardEvent) => void;
}

const isEditableKeyboardTarget = (target: EventTarget | null) => {
  const node = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tagName = String(node?.tagName || "").toLowerCase();
  return Boolean(node?.isContentEditable || ["input", "select", "textarea"].includes(tagName));
};

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    if (Platform.OS !== "web" || shortcuts.length === 0) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (shortcut.ignoreRepeat && event.repeat) {
          continue;
        }
        if (shortcut.ignoreEditableTargets && isEditableKeyboardTarget(event.target)) {
          continue;
        }

        const keyMatches =
          event.key.toLowerCase() === shortcut.key.toLowerCase();
        const shiftMatches =
          shortcut.shift === undefined || shortcut.shift === event.shiftKey;
        const ctrlMatches =
          shortcut.ctrl === undefined || shortcut.ctrl === event.ctrlKey;
        const altMatches =
          shortcut.alt === undefined || shortcut.alt === event.altKey;
        const metaMatches =
          shortcut.meta === undefined || shortcut.meta === event.metaKey;
        const modMatches =
          shortcut.mod === undefined || shortcut.mod === (event.ctrlKey || event.metaKey);

        if (
          keyMatches &&
          shiftMatches &&
          ctrlMatches &&
          altMatches &&
          metaMatches &&
          modMatches
        ) {
          if (shortcut.preventDefault ?? true) {
            event.preventDefault();
          }
          shortcut.callback(event);
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [shortcuts]);
}
