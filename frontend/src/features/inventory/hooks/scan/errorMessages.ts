type InventoryErrorContext = "load-item" | "refresh-stock" | "save-count";

const CONTEXT_FALLBACKS: Record<InventoryErrorContext, string> = {
  "load-item": "We couldn't load this item right now. Please try again.",
  "refresh-stock": "We couldn't refresh the stock right now. Please try again.",
  "save-count": "We couldn't save the count right now. Please try again.",
};

const FIELD_LABELS: Record<string, string> = {
  counted_qty: "Quantity",
  damaged_qty: "Damage quantity",
  expiry_date: "Expiry date",
  floor_no: "Floor",
  item_code: "Item code",
  item_name: "Item name",
  manufacturing_date: "Manufacturing date",
  mrp_counted: "MRP",
  non_returnable_damaged_qty: "Damage quantity",
  photo_proofs: "Photos",
  rack_no: "Rack",
  remark: "Remark",
  serial_entries: "Serial number",
  serial_number: "Serial number",
  serial_numbers: "Serial numbers",
  session_id: "Session",
  variance_reason: "Variance reason",
};

const GENERIC_PATH_SEGMENTS = new Set(["body", "path", "payload", "query"]);

const ensureSentence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).replace(/\s+/g, " ");

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
};

const humanizeFieldLabel = (detailPath: unknown): string | null => {
  if (!Array.isArray(detailPath)) {
    return null;
  }

  const relevantSegment = [...detailPath]
    .reverse()
    .find(
      (segment) => typeof segment === "string" && !GENERIC_PATH_SEGMENTS.has(segment.toLowerCase())
    );

  if (!relevantSegment || typeof relevantSegment !== "string") {
    return null;
  }

  const normalized = relevantSegment.toLowerCase();
  if (FIELD_LABELS[normalized]) {
    return FIELD_LABELS[normalized];
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatValidationMessage = (message: unknown, label?: string | null): string | null => {
  if (typeof message !== "string" || message.trim().length === 0) {
    return null;
  }

  const normalized = message.trim();

  if (/^field required$/i.test(normalized)) {
    return ensureSentence(`${label || "This field"} is required`);
  }

  if (/^input should be greater than 0$/i.test(normalized) && label) {
    return ensureSentence(`${label} must be greater than 0`);
  }

  if (/^input should be/i.test(normalized) && label) {
    return ensureSentence(`${label} ${normalized.replace(/^input should be/i, "must be").trim()}`);
  }

  if (/^value error, /i.test(normalized)) {
    return ensureSentence(normalized.replace(/^value error, /i, ""));
  }

  return label
    ? ensureSentence(`${label}: ${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`)
    : ensureSentence(normalized);
};

export const formatBackendValidationDetail = (detail: unknown): string | null => {
  if (!detail) {
    return null;
  }

  if (typeof detail === "string") {
    return ensureSentence(detail);
  }

  if (!Array.isArray(detail)) {
    return null;
  }

  const entries = detail
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const typedEntry = entry as {
        loc?: unknown;
        msg?: unknown;
      };

      const label = humanizeFieldLabel(typedEntry.loc);
      return formatValidationMessage(typedEntry.msg, label);
    })
    .filter((value): value is string => Boolean(value));

  return entries.length > 0 ? entries.slice(0, 3).join("\n") : null;
};

const getTimeoutMessage = (context: InventoryErrorContext): string => {
  switch (context) {
    case "load-item":
      return "The item request timed out. Check your connection and try again.";
    case "refresh-stock":
      return "The stock refresh timed out. Please try again.";
    case "save-count":
      return "The count request timed out. Please try again.";
  }
};

const getNetworkMessage = (context: InventoryErrorContext): string => {
  switch (context) {
    case "load-item":
      return "We couldn't reach the server to load this item. Check your connection and try again.";
    case "refresh-stock":
      return "We couldn't reach the server to refresh stock. Check your connection and try again.";
    case "save-count":
      return "We couldn't reach the server to save the count. Check your connection and try again.";
  }
};

export const getReadableInventoryErrorMessage = (
  error: unknown,
  context: InventoryErrorContext
): string => {
  const fallback = CONTEXT_FALLBACKS[context];
  const typedError = error as {
    code?: string;
    message?: string;
    response?: {
      status?: number;
      data?: {
        detail?: unknown;
        message?: unknown;
      };
    };
  };

  const status = typedError?.response?.status;
  const detail = typedError?.response?.data?.detail;

  if (status === 422) {
    return (
      formatBackendValidationDetail(detail) ||
      "Some details are missing or invalid. Check the form and try again."
    );
  }

  if (status === 409 && context === "save-count") {
    return "This item has already been counted for this location.";
  }

  if (status === 423 && context === "save-count") {
    return "Another user is updating this item right now. Please try again in a moment.";
  }

  if (status === 404 && context === "load-item") {
    return "We couldn't find an item for this barcode. Check the barcode and try again.";
  }

  if (status === 401 || status === 403) {
    return "Your session has expired or you no longer have access. Sign in again and try once more.";
  }

  if (typeof status === "number" && status >= 500) {
    return fallback;
  }

  const rawMessage =
    typeof typedError?.response?.data?.message === "string"
      ? typedError.response.data.message
      : typeof detail === "string"
        ? detail
        : typedError?.message;

  if (!rawMessage) {
    return fallback;
  }

  if (typedError?.code === "ECONNABORTED" || /timeout/i.test(rawMessage)) {
    return getTimeoutMessage(context);
  }

  if (
    /network error|failed to fetch|network request failed|econnrefused|cannot connect/i.test(
      rawMessage
    )
  ) {
    return getNetworkMessage(context);
  }

  if (/request failed with status code \d+/i.test(rawMessage)) {
    return fallback;
  }

  return ensureSentence(rawMessage);
};
