type AuthApiErrorFieldMap = Record<string, string>;

export type NormalizedAuthApiError = {
  status?: number;
  code?: string;
  message?: string;
  fields: AuthApiErrorFieldMap;
  retryAfter?: number;
  detail?: unknown;
  transportCode?: string;
  hasResponse: boolean;
};

const extractLastStringFromLoc = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const segment = [...value].reverse().find((item) => typeof item === "string");
  return typeof segment === "string" ? segment : null;
};

const normalizeFields = (value: unknown): AuthApiErrorFieldMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<AuthApiErrorFieldMap>(
    (accumulator, [field, message]) => {
      if (typeof message === "string" && message.trim().length > 0) {
        accumulator[field] = message.trim();
      }
      return accumulator;
    },
    {},
  );
};

const fieldsFromValidationArray = (detail: unknown): AuthApiErrorFieldMap => {
  if (!Array.isArray(detail)) {
    return {};
  }

  return detail.reduce<AuthApiErrorFieldMap>((accumulator, entry) => {
    if (!entry || typeof entry !== "object") {
      return accumulator;
    }

    const typedEntry = entry as {
      loc?: unknown;
      msg?: unknown;
    };
    const fieldName = extractLastStringFromLoc(typedEntry.loc);
    if (!fieldName || accumulator[fieldName]) {
      return accumulator;
    }

    if (typeof typedEntry.msg === "string" && typedEntry.msg.trim().length > 0) {
      accumulator[fieldName] = typedEntry.msg.trim();
    }
    return accumulator;
  }, {});
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const parseRetryAfter = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const normalizeAuthApiError = (error: unknown): NormalizedAuthApiError => {
  const typedError = error as {
    code?: string;
    message?: string;
    response?: {
      status?: number;
      headers?: Record<string, unknown>;
      data?: unknown;
    };
  };

  const dataRecord = asRecord(typedError?.response?.data);
  const detail = dataRecord?.detail;
  const detailRecord = asRecord(detail);
  const rootRecord = detailRecord ?? dataRecord;
  const nestedDetails = asRecord(rootRecord?.details);
  const nestedError = asRecord(dataRecord?.error);
  const rootFields = normalizeFields(rootRecord?.fields);
  const dataFields = normalizeFields(dataRecord?.fields);
  const nestedErrorFields = normalizeFields(nestedError?.fields);
  const fields =
    Object.keys(rootFields).length > 0
      ? rootFields
      : Object.keys(dataFields).length > 0
        ? dataFields
        : nestedErrorFields;
  const fallbackFields =
    Object.keys(fields).length > 0 ? fields : fieldsFromValidationArray(detail);

  const code =
    (typeof rootRecord?.code === "string" ? rootRecord.code : undefined) ||
    (typeof rootRecord?.error === "string" ? rootRecord.error : undefined) ||
    (typeof dataRecord?.code === "string" ? dataRecord.code : undefined) ||
    (typeof dataRecord?.error_code === "string"
      ? dataRecord.error_code
      : undefined) ||
    (typeof nestedError?.code === "string" ? nestedError.code : undefined);

  const message =
    (typeof rootRecord?.message === "string" ? rootRecord.message : undefined) ||
    (typeof dataRecord?.message === "string" ? dataRecord.message : undefined) ||
    (typeof nestedError?.message === "string" ? nestedError.message : undefined) ||
    (typeof detail === "string" ? detail : undefined) ||
    typedError?.message;

  const retryAfter =
    parseRetryAfter(rootRecord?.retry_after) ??
    parseRetryAfter(rootRecord?.retryAfter) ??
    parseRetryAfter(nestedDetails?.retry_after) ??
    parseRetryAfter(dataRecord?.retry_after) ??
    parseRetryAfter(typedError?.response?.headers?.["retry-after"]);

  return {
    status: typedError?.response?.status,
    code,
    message,
    fields: fallbackFields,
    retryAfter,
    detail: Array.isArray(detail) ? detail : nestedDetails ?? detail,
    transportCode: typedError?.code,
    hasResponse: Boolean(typedError?.response),
  };
};
