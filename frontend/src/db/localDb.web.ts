import type { CreateCountLinePayload, Item } from "@/types/scan";
import { storage } from "@/services/storage/asyncStorageService";

const ITEMS_KEY = "web_local_db:items";
const PENDING_VERIFICATIONS_KEY = "web_local_db:pending_verifications";
const PENDING_COUNT_LINES_KEY = "web_local_db:pending_count_lines";

export interface LocalItem {
  barcode: string;
  item_code?: string;
  name: string;
  category: string;
  verified: number;
  last_sync: string;
}

export interface PendingVerification {
  id?: number;
  barcode: string;
  verified: number;
  timestamp: string;
  username: string;
  variance: number;
  status?: string;
}

export interface PendingCountLine {
  id?: number;
  session_id: string;
  item_code: string;
  payload_json: string;
  created_at: string;
}

type WebDbState = {
  items: LocalItem[];
  pendingVerifications: PendingVerification[];
  pendingCountLines: PendingCountLine[];
};

const emptyState = (): WebDbState => ({
  items: [],
  pendingVerifications: [],
  pendingCountLines: [],
});

let state: WebDbState = emptyState();
let hydratePromise: Promise<void> | null = null;

const ensureArray = <T>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

const hydrateState = async () => {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const [items, pendingVerifications, pendingCountLines] =
        await Promise.all([
          storage.get<LocalItem[]>(ITEMS_KEY, {
            defaultValue: [],
            silent: true,
          }),
          storage.get<PendingVerification[]>(PENDING_VERIFICATIONS_KEY, {
            defaultValue: [],
            silent: true,
          }),
          storage.get<PendingCountLine[]>(PENDING_COUNT_LINES_KEY, {
            defaultValue: [],
            silent: true,
          }),
        ]);

      state = {
        items: ensureArray(items),
        pendingVerifications: ensureArray(pendingVerifications),
        pendingCountLines: ensureArray(pendingCountLines),
      };
    })();
  }

  await hydratePromise;
};

const persistState = async () => {
  await Promise.all([
    storage.set(ITEMS_KEY, state.items, { silent: true }),
    storage.set(PENDING_VERIFICATIONS_KEY, state.pendingVerifications, {
      silent: true,
    }),
    storage.set(PENDING_COUNT_LINES_KEY, state.pendingCountLines, {
      silent: true,
    }),
  ]);
};

const getNextId = (
  entries: { id?: number }[],
): number => entries.reduce((max, entry) => Math.max(max, entry.id ?? 0), 0) + 1;

const mapLocalItemToAppItem = (row: LocalItem): Partial<Item> => ({
  id: row.barcode,
  item_code: row.item_code ?? row.barcode,
  barcode: row.barcode,
  name: row.name,
  item_name: row.name,
  category: row.category,
});

export const initDb = async () => {
  await hydrateState();
  return null;
};

export const getDb = async () => {
  await hydrateState();
  return null;
};

export const saveLocalItems = async (items: LocalItem[]) => {
  await hydrateState();
  const nextItems = new Map(state.items.map((item) => [item.barcode, item]));
  items.forEach((item) => {
    nextItems.set(item.barcode, item);
  });
  state.items = Array.from(nextItems.values());
  await persistState();
};

export const getLocalItems = async (): Promise<LocalItem[]> => {
  await hydrateState();
  return [...state.items];
};

export const getLatestItemSyncTimestamp = async (): Promise<string | null> => {
  await hydrateState();
  if (state.items.length === 0) {
    return null;
  }

  return state.items.reduce<string | null>((latest, item) => {
    if (!item.last_sync) {
      return latest;
    }

    if (!latest) {
      return item.last_sync;
    }

    return new Date(item.last_sync).getTime() > new Date(latest).getTime()
      ? item.last_sync
      : latest;
  }, null);
};

export const addPendingVerification = async (
  verification: PendingVerification,
) => {
  await hydrateState();
  state.pendingVerifications.push({
    ...verification,
    id: verification.id ?? getNextId(state.pendingVerifications),
    status: verification.status || "pending",
  });
  await persistState();
};

export const getPendingVerifications = async (): Promise<
  PendingVerification[]
> => {
  await hydrateState();
  return state.pendingVerifications.filter(
    (verification) => verification.status === "pending",
  );
};

export const updatePendingVerificationStatus = async (
  id: number,
  status: string,
) => {
  await hydrateState();
  state.pendingVerifications = state.pendingVerifications.map((verification) =>
    verification.id === id ? { ...verification, status } : verification,
  );
  await persistState();
};

export const deletePendingVerification = async (id: number) => {
  await hydrateState();
  state.pendingVerifications = state.pendingVerifications.filter(
    (verification) => verification.id !== id,
  );
  await persistState();
};

export const clearPendingVerifications = async (ids: number[]) => {
  if (ids.length === 0) {
    return;
  }

  await hydrateState();
  state.pendingVerifications = state.pendingVerifications.filter(
    (verification) => !ids.includes(verification.id ?? -1),
  );
  await persistState();
};

export const localDb = {
  async getItemByBarcode(barcode: string): Promise<Partial<Item> | null> {
    await hydrateState();
    const row = state.items.find((item) => item.barcode === barcode);
    return row ? mapLocalItemToAppItem(row) : null;
  },

  async searchItems(query: string): Promise<Partial<Item>[]> {
    await hydrateState();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return state.items
      .filter((item) =>
        [item.barcode, item.item_code, item.name, item.category]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery)),
      )
      .sort((left, right) => right.last_sync.localeCompare(left.last_sync))
      .slice(0, 25)
      .map(mapLocalItemToAppItem);
  },

  async savePendingVerification(
    payload: CreateCountLinePayload,
  ): Promise<void> {
    await hydrateState();
    state.pendingCountLines.push({
      id: getNextId(state.pendingCountLines),
      session_id: payload.session_id,
      item_code: payload.item_code,
      payload_json: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    });
    await persistState();
  },

  async getPendingCountLines(): Promise<PendingCountLine[]> {
    await hydrateState();
    return [...state.pendingCountLines];
  },

  async deletePendingCountLine(id: number): Promise<void> {
    await hydrateState();
    state.pendingCountLines = state.pendingCountLines.filter(
      (countLine) => countLine.id !== id,
    );
    await persistState();
  },

  async getSessionStats(sessionId: string): Promise<{
    totalItems: number;
    scannedItems: number;
    verifiedItems: number;
    pendingItems: number;
  } | null> {
    await hydrateState();

    const pendingItems = state.pendingCountLines.filter(
      (countLine) => countLine.session_id === sessionId,
    ).length;
    const verifiedItems = state.items.filter((item) => item.verified === 1).length;
    const totalItems = state.items.length;

    return {
      totalItems,
      scannedItems: verifiedItems + pendingItems,
      verifiedItems,
      pendingItems,
    };
  },
};
