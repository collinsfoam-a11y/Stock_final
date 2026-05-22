import { useMemo } from "react";

import {
  OPERATIONAL_TELEMETRY_EVENT_REGISTRY,
  operationalTelemetry,
} from "@/services/observability/operationalTelemetry";
import { useKeyboardShortcuts, type KeyboardShortcut } from "./useKeyboardShortcuts";

export interface OperationalQueueNavigationOptions<T> {
  items: T[];
  selectedItem?: T | null;
  getItemId: (item: T) => string;
  onSelect: (item: T | null) => void;
  onOpen?: (item: T) => void;
  onEscape?: () => void;
  enabled?: boolean;
  pageSize?: number;
  telemetrySurface?: string;
}

export function useOperationalQueueNavigation<T>({
  items,
  selectedItem,
  getItemId,
  onSelect,
  onOpen,
  onEscape,
  enabled = true,
  pageSize = 8,
  telemetrySurface = "operational_queue",
}: OperationalQueueNavigationOptions<T>) {
  const shortcuts = useMemo<KeyboardShortcut[]>(() => {
    if (!enabled || items.length === 0) return [];

    const selectedId = selectedItem ? getItemId(selectedItem) : null;
    const selectedIndex = selectedId
      ? Math.max(
          0,
          items.findIndex((item) => getItemId(item) === selectedId)
        )
      : 0;
    const selectIndex = (nextIndex: number, action: string) => {
      const boundedIndex = Math.min(Math.max(nextIndex, 0), items.length - 1);
      operationalTelemetry.trackQueue(
        OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_TRAVERSAL,
        "success",
        {
          action,
          surface: telemetrySurface,
        },
        {
          fromIndex: selectedIndex,
          toIndex: boundedIndex,
          total: items.length,
        }
      );
      onSelect(items[boundedIndex] ?? null);
    };
    const baseShortcut = {
      preventDefault: true,
      ignoreEditableTargets: true,
      ignoreRepeat: true,
    } satisfies Partial<KeyboardShortcut>;

    return [
      {
        ...baseShortcut,
        key: "ArrowDown",
        callback: () => selectIndex(selectedIndex + 1, "ArrowDown"),
      },
      {
        ...baseShortcut,
        key: "ArrowUp",
        callback: () => selectIndex(selectedIndex - 1, "ArrowUp"),
      },
      {
        ...baseShortcut,
        key: "Home",
        callback: () => selectIndex(0, "Home"),
      },
      {
        ...baseShortcut,
        key: "End",
        callback: () => selectIndex(items.length - 1, "End"),
      },
      {
        ...baseShortcut,
        key: "PageDown",
        callback: () => selectIndex(selectedIndex + pageSize, "PageDown"),
      },
      {
        ...baseShortcut,
        key: "PageUp",
        callback: () => selectIndex(selectedIndex - pageSize, "PageUp"),
      },
      ...(onOpen
        ? [
            {
              ...baseShortcut,
              key: "Enter",
              callback: () => {
                const item = items[selectedIndex];
                if (item) {
                  operationalTelemetry.trackQueue(
                    OPERATIONAL_TELEMETRY_EVENT_REGISTRY.QUEUE_TRAVERSAL,
                    "success",
                    { action: "Enter", surface: telemetrySurface },
                    { fromIndex: selectedIndex, toIndex: selectedIndex, total: items.length }
                  );
                  onOpen(item);
                }
              },
            },
          ]
        : []),
      ...(onEscape
        ? [
            {
              ...baseShortcut,
              key: "Escape",
              callback: onEscape,
            },
          ]
        : []),
    ];
  }, [
    enabled,
    getItemId,
    items,
    onEscape,
    onOpen,
    onSelect,
    pageSize,
    selectedItem,
    telemetrySurface,
  ]);

  useKeyboardShortcuts(shortcuts);
}
