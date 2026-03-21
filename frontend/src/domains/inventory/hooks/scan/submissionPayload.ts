export interface BackendPhotoProof {
  id: string;
  url: string;
  timestamp: string;
}

export const toBackendPhotoProofs = (
  photoUris: string[],
  timestamp: string = new Date().toISOString(),
): BackendPhotoProof[] => {
  return photoUris
    .map((uri) => (uri || "").trim())
    .filter((uri) => uri.length > 0)
    .map((uri, index) => ({
      id: `photo_${index + 1}`,
      url: uri,
      timestamp,
    }));
};

export const formatBackendValidationDetail = (detail: unknown): string | null => {
  if (!detail) {
    return null;
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const entries = detail
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const typedEntry = entry as {
          loc?: unknown;
          msg?: unknown;
        };
        const loc = Array.isArray(typedEntry.loc)
          ? typedEntry.loc.map((segment) => String(segment)).join(".")
          : "";
        const msg = typeof typedEntry.msg === "string" ? typedEntry.msg : "";
        const formatted = [loc, msg].filter(Boolean).join(": ");
        return formatted || null;
      })
      .filter((value): value is string => Boolean(value));

    if (entries.length > 0) {
      return entries.slice(0, 3).join("\n");
    }
  }

  return null;
};
