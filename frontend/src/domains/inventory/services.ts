import {
  createCountLine as createCountLineApi,
  getCountLines as getCountLinesApi,
  getItemByBarcode as getItemByBarcodeApi,
  isOnline,
} from "../../services/api/api";
import type { CreateCountLinePayload as ApiCreateCountLinePayload } from "../../types/scan";
import type { CreateCountLinePayload, Item } from "./types";

/**
 * Inventory domain adapters.
 *
 * The canonical network/offline implementation lives under `services/api`.
 * Keeping this domain surface as a thin wrapper prevents the hooks here from
 * drifting away from the app's shared barcode and count-line behavior.
 */

export { isOnline };

export const getItemByBarcode = async (
  barcode: string,
  retryCount: number = 3
): Promise<Item> => {
  return (await getItemByBarcodeApi(barcode, retryCount)) as Item;
};

export const createCountLine = async (countData: CreateCountLinePayload) => {
  return createCountLineApi(countData as ApiCreateCountLinePayload);
};

export const getCountLines = async (
  sessionId: string,
  page: number = 1,
  pageSize: number = 50,
  verified?: boolean
) => {
  return getCountLinesApi(sessionId, page, pageSize, verified);
};
