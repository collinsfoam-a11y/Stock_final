import React from "react";
import { useLocalSearchParams, usePathname } from "expo-router";

const consumedRouteNotices = new Set<string>();

const normalizeNoticeValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const resetRouteNoticeCache = () => {
  consumedRouteNotices.clear();
};

export function useRouteNotice<T>(
  resolveNotice: (noticeKey: string | string[] | undefined) => T | null,
) {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ notice?: string | string[] }>();
  const rawNotice = params.notice;
  const routeKey = React.useMemo(() => {
    const normalized = normalizeNoticeValue(rawNotice);
    if (!normalized) {
      return null;
    }

    return `${pathname}:${normalized}`;
  }, [pathname, rawNotice]);
  const [notice, setNotice] = React.useState<T | null>(null);

  React.useEffect(() => {
    if (!routeKey) {
      setNotice(null);
      return;
    }

    if (consumedRouteNotices.has(routeKey)) {
      setNotice(null);
      return;
    }

    const nextNotice = resolveNotice(rawNotice);
    if (!nextNotice) {
      setNotice(null);
      return;
    }

    consumedRouteNotices.add(routeKey);
    setNotice(nextNotice);
  }, [rawNotice, resolveNotice, routeKey]);

  const clearNotice = React.useCallback(() => {
    setNotice(null);
  }, []);

  return {
    notice,
    clearNotice,
  };
}
