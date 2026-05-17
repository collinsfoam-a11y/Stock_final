type ItemWithStock = {
  stock_qty?: unknown;
  current_stock?: unknown;
  batch_no?: unknown;
  item_code?: unknown;
  item_name?: unknown;
  name?: unknown;
  barcode?: unknown;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toKeyText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const compareText = (a: unknown, b: unknown): number =>
  toKeyText(a).localeCompare(toKeyText(b));

const itemFamilyKey = (item: ItemWithStock): string => {
  const itemCode = toKeyText(item.item_code);
  if (itemCode) {
    return `code:${itemCode}`;
  }

  const itemName = toKeyText(item.item_name ?? item.name);
  if (itemName) {
    return `name:${itemName}`;
  }

  const barcode = toKeyText(item.barcode);
  if (barcode) {
    return `barcode:${barcode}`;
  }

  return "";
};

const compareByStockThenIdentity = (a: ItemWithStock, b: ItemWithStock): number => {
  const stockDiff = getStockQty(b) - getStockQty(a);
  if (stockDiff !== 0) {
    return stockDiff;
  }

  const batchDiff = compareText(a.batch_no, b.batch_no);
  if (batchDiff !== 0) {
    return batchDiff;
  }

  const codeDiff = compareText(a.item_code, b.item_code);
  if (codeDiff !== 0) {
    return codeDiff;
  }

  return compareText(a.barcode, b.barcode);
};

export const getStockQty = (item: ItemWithStock | null | undefined): number => {
  if (!item) {
    return 0;
  }
  return toNumber(item.stock_qty) || toNumber(item.current_stock);
};

export const sortItemsByStockDesc = <T extends ItemWithStock>(items: T[]): T[] =>
  [...items].sort((a, b) => compareByStockThenIdentity(a, b));

export const dedupeItemsKeepingHighestStock = <T extends ItemWithStock>(
  items: T[],
): T[] => {
  const deduped = new Map<string, T>();
  const unkeyed: T[] = [];

  for (const item of items) {
    const key = itemFamilyKey(item);

    if (!key) {
      unkeyed.push(item);
      continue;
    }

    const existing = deduped.get(key);
    if (!existing || compareByStockThenIdentity(item, existing) < 0) {
      deduped.set(key, item);
    }
  }

  return sortItemsByStockDesc([...deduped.values(), ...unkeyed]);
};
