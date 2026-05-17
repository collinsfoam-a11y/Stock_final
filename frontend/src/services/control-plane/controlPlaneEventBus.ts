import { eventEmitter } from "@/utils/eventEmitter";

export type ControlPlaneEventMap = {
  "session.changed": {
    sessionId?: string;
    localSessionId?: string;
    reason:
      | "recorded"
      | "synced"
      | "retry"
      | "failed"
      | "finalized"
      | "status_changed"
      | "heartbeat";
  };
  "inventory.changed": {
    sessionId?: string;
    itemCode?: string;
    localEventId?: string;
    reason: "recorded" | "synced" | "retry" | "failed";
  };
  "review.changed": {
    lineId?: string;
    sessionId?: string;
    localEventId?: string;
    reason: "recorded" | "synced" | "retry" | "failed";
  };
  "sync.completed": {
    success: number;
    failed: number;
    total: number;
  };
};

export type ControlPlaneEventName = keyof ControlPlaneEventMap;

type EventCallback<K extends ControlPlaneEventName> = (
  payload: ControlPlaneEventMap[K]
) => void | Promise<void>;

class ControlPlaneEventBus {
  publish<K extends ControlPlaneEventName>(event: K, payload: ControlPlaneEventMap[K]): void {
    eventEmitter.emit(event, payload);
  }

  subscribe<K extends ControlPlaneEventName>(event: K, callback: EventCallback<K>): () => void {
    return eventEmitter.on(event, callback as (...args: any[]) => void);
  }
}

export const controlPlaneEventBus = new ControlPlaneEventBus();
