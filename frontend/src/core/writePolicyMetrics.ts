import { createLogger } from "@/services/logging";
import { storage } from "@/services/storage/asyncStorageService";

import type { WritePolicyDecision } from "./connectivityState";

const log = createLogger("WritePolicyMetrics");
const WRITE_POLICY_METRICS_KEY = "write_policy_metrics_v1";

export interface WritePolicyMetrics {
  directWrites: number;
  queuedWrites: number;
  blockedWrites: number;
  updatedAt: string | null;
}

const EMPTY_METRICS: WritePolicyMetrics = {
  directWrites: 0,
  queuedWrites: 0,
  blockedWrites: 0,
  updatedAt: null,
};

const normalizeMetrics = (value: unknown): WritePolicyMetrics => {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_METRICS };
  }

  const candidate = value as Partial<WritePolicyMetrics>;
  return {
    directWrites: Number(candidate.directWrites || 0),
    queuedWrites: Number(candidate.queuedWrites || 0),
    blockedWrites: Number(candidate.blockedWrites || 0),
    updatedAt:
      typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : null,
  };
};

export const getWritePolicyMetrics = async (): Promise<WritePolicyMetrics> => {
  try {
    const stored = await storage.get<WritePolicyMetrics>(WRITE_POLICY_METRICS_KEY, {
      defaultValue: { ...EMPTY_METRICS },
    });
    return normalizeMetrics(stored);
  } catch (error) {
    log.warn("Failed to read write policy metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...EMPTY_METRICS };
  }
};

export const recordWritePolicyDecision = async (
  decision: WritePolicyDecision
): Promise<void> => {
  try {
    const current = await getWritePolicyMetrics();
    const updated: WritePolicyMetrics = {
      ...current,
      updatedAt: new Date().toISOString(),
    };

    if (decision === "DIRECT") {
      updated.directWrites += 1;
    } else if (decision === "ENQUEUE") {
      updated.queuedWrites += 1;
    } else {
      updated.blockedWrites += 1;
    }

    await storage.set(WRITE_POLICY_METRICS_KEY, updated);
  } catch (error) {
    log.warn("Failed to persist write policy decision", {
      decision,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const clearWritePolicyMetrics = async (): Promise<void> => {
  try {
    await storage.remove(WRITE_POLICY_METRICS_KEY);
  } catch (error) {
    log.warn("Failed to clear write policy metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
