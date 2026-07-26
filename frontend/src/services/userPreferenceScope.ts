const normalizeScope = (scope?: string | null): string | null => {
  const trimmed = scope?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/[^A-Za-z0-9_-]/g, "_");
};

let currentUserPreferenceScope: string | null = null;

export const setUserPreferenceScope = (scope?: string | null): void => {
  currentUserPreferenceScope = normalizeScope(scope);
};

export const getUserPreferenceScope = (): string | null =>
  currentUserPreferenceScope;

export const getScopedStorageKey = (
  baseKey: string,
  scope: string | null = currentUserPreferenceScope,
): string => {
  const normalizedScope = normalizeScope(scope);
  return normalizedScope ? `${baseKey}:${normalizedScope}` : baseKey;
};

export const getScopedStorageKeyCandidates = (
  baseKey: string,
  scope: string | null = currentUserPreferenceScope,
): string[] => {
  const scopedKey = getScopedStorageKey(baseKey, scope);
  return scopedKey === baseKey ? [baseKey] : [scopedKey, baseKey];
};
