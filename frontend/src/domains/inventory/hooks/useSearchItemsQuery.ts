import { useQuery } from "@tanstack/react-query";
import { searchItems } from "@/services/api";
import { localDb } from "@/db/localDb";
import { useSettingsStore } from "@/store/settingsStore";

interface UseSearchItemsQueryOptions {
  query: string;
  enabled?: boolean;
  minChars?: number;
}

/**
 * React Query hook for searching items
 * Provides caching and debouncing via query key changes
 */
export const useSearchItemsQuery = ({
  query,
  enabled = true,
  minChars = 2,
}: UseSearchItemsQueryOptions) => {
  const shouldSearch = query.trim().length >= minChars;
  const offlineMode = useSettingsStore((state) => state.settings.offlineMode);

  return useQuery({
    queryKey: ["items", "search", query, offlineMode ? "offline" : "online"],
    queryFn: async () => {
      if (offlineMode) {
        return { items: await localDb.searchItems(query) };
      }
      return searchItems(query);
    },
    enabled: enabled && shouldSearch,
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep previous results while searching
  });
};
