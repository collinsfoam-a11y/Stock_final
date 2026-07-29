import { useQuery } from "@tanstack/react-query";
import { getItemByBarcode } from "@/services/api";
import { localDb } from "@/db/localDb";
import { useSettingsStore } from "@/store/settingsStore";

interface UseItemByBarcodeQueryOptions {
  barcode: string | null;
  enabled?: boolean;
  retryCount?: number;
}

/**
 * React Query hook for fetching an item by barcode
 * Provides caching, automatic retries, and offline support
 */
export const useItemByBarcodeQuery = ({
  barcode,
  enabled = true,
  retryCount = 3,
}: UseItemByBarcodeQueryOptions) => {
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);

  return useQuery({
    queryKey: ["item", "barcode", barcode, offlineMode ? "offline" : "online"],
    queryFn: () => {
      if (!barcode) {
        throw new Error("Barcode is required");
      }
      if (offlineMode) {
        return localDb.getItemByBarcode(barcode);
      }
      return getItemByBarcode(barcode, retryCount);
    },
    enabled: enabled && !!barcode,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    retry: retryCount,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
};
