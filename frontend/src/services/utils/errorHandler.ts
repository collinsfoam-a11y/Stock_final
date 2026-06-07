import { logger } from '@/services/logging';
/**
 * Centralized Error Handling Service
 * Provides professional error handling for the entire application
 */

import { Alert } from "react-native";

export interface ApiError {
  message: string;
  detail?: string;
  code?: string;
  category?: string;
  statusCode?: number;
  details?: any;
  context?: any;
}

type MutableApiError = Required<
  Pick<ApiError, "message" | "detail" | "code" | "category" | "statusCode" | "details" | "context">
>;

const STATUS_FALLBACKS: Record<number, Pick<MutableApiError, "message" | "code" | "category">> = {
  400: {
    message: "Invalid request. Please check your input.",
    code: "VAL_002",
    category: "validation",
  },
  401: {
    message: "Session expired. Please login again.",
    code: "AUTH_003",
    category: "authentication",
  },
  403: {
    message: "You don't have permission to perform this action.",
    code: "AUTHZ_001",
    category: "authorization",
  },
  404: {
    message: "Requested resource not found.",
    code: "RES_001",
    category: "resource",
  },
  409: {
    message: "This operation conflicts with existing data.",
    code: "VAL_002",
    category: "validation",
  },
  422: {
    message: "Validation error. Please check your input.",
    code: "VAL_002",
    category: "validation",
  },
  429: {
    message: "Too many requests. Please wait a moment and try again.",
    code: "SRV_002",
    category: "server",
  },
  500: {
    message: "Server error. Please try again later.",
    code: "SRV_001",
    category: "server",
  },
  503: {
    message: "Service temporarily unavailable. Please try again.",
    code: "DB_001",
    category: "database",
  },
};

const createDefaultApiError = (): MutableApiError => ({
  message: "An unexpected error occurred",
  detail: "Please try again or contact support if the problem persists.",
  code: "UNK_001",
  category: "unknown",
  statusCode: 500,
  details: null,
  context: null,
});

const applyStructuredServerError = (result: MutableApiError, details: any): boolean => {
  if (!details || typeof details !== "object") return false;
  if (details.message) result.message = details.message;
  if (details.detail) result.detail = details.detail;
  if (details.code) result.code = details.code;
  if (details.category) result.category = details.category;
  if (details.context) result.context = details.context;
  return true;
};

const applyStatusFallback = (result: MutableApiError, statusCode: number): void => {
  const fallback = STATUS_FALLBACKS[statusCode];
  if (!fallback) return;
  result.message = fallback.message;
  result.code = fallback.code;
  result.category = fallback.category;
};

const buildServerApiError = (error: any): MutableApiError => {
  const result = createDefaultApiError();
  result.statusCode = error.response.status;
  result.details = error.response.data;

  if (typeof result.details === "string") {
    result.message = result.details;
    result.detail = result.details;
    return result;
  }

  const hasStructuredPayload = applyStructuredServerError(result, result.details);
  if (!hasStructuredPayload) {
    applyStatusFallback(result, result.statusCode);
  }

  return result;
};

const buildRequestApiError = (error: any): MutableApiError => {
  if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
    return {
      ...createDefaultApiError(),
      statusCode: 0,
      message: "Connection timeout. Please check your internet connection and try again.",
      code: "NET_001",
      category: "network",
      detail:
        "The request took too long to complete. Your connection may be slow or unstable.",
    };
  }

  if (error.code === "ECONNREFUSED" || !error.response) {
    return {
      ...createDefaultApiError(),
      statusCode: 0,
      message: "Cannot connect to server. Please check if the server is running.",
      code: "NET_002",
      category: "network",
      detail: "The server is not responding. It may be down or unreachable.",
    };
  }

  return {
    ...createDefaultApiError(),
    statusCode: 0,
    message: "Network error. Please check your internet connection.",
    code: "NET_001",
    category: "network",
    detail: "Unable to reach the server. Please check your network connection.",
  };
};

const buildSetupApiError = (error: any): MutableApiError => ({
  ...createDefaultApiError(),
  message: error.message || "An unexpected error occurred",
  detail: error.message || "Please try again or contact support.",
});

export class ErrorHandler {
  /**
   * Handle API errors with user-friendly messages
   */
  static handleApiError(error: any, context?: string): ApiError {
    logger.error(`[${context || "API Error"}]`, { error: error?.message || String(error) });
    if (error.response) return buildServerApiError(error);
    if (error.request) return buildRequestApiError(error);
    return buildSetupApiError(error);
  }

  /**
   * Show error alert to user
   */
  static showError(error: any, context?: string, title = "Error") {
    const apiError = this.handleApiError(error, context);

    Alert.alert(title, apiError.message, [{ text: "OK", style: "default" }], {
      cancelable: true,
    });
  }

  /**
   * Show success message
   */
  static showSuccess(message: string, title = "Success") {
    Alert.alert(title, message, [{ text: "OK", style: "default" }], {
      cancelable: true,
    });
  }

  /**
   * Show confirmation dialog
   */
  static showConfirm(
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    title = "Confirm",
  ) {
    Alert.alert(
      title,
      message,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: onCancel,
        },
        {
          text: "Confirm",
          style: "default",
          onPress: onConfirm,
        },
      ],
      { cancelable: true },
    );
  }

  /**
   * Validate required fields
   */
  static validateRequired(
    fields: Record<string, any>,
    fieldNames: Record<string, string>,
  ): string | null {
    for (const [key, label] of Object.entries(fieldNames)) {
      if (!fields[key] || fields[key].toString().trim() === "") {
        return `${label} is required`;
      }
    }
    return null;
  }

  /**
   * Validate barcode format
   * @deprecated Use validateBarcode() from utils/validation.ts instead
   * This method only checks numeric barcodes and returns a boolean.
   * The new implementation provides better validation and normalization.
   */
  static validateBarcode(barcode: string): boolean {
    return /^\d{8,13}$/.test(barcode);
  }

  /**
   * Validate numeric input
   */
  static validateNumeric(value: string): boolean {
    return /^\d+(\.\d+)?$/.test(value);
  }

  /**
   * Log error for debugging
   */
  static logError(context: string, error: any, additionalInfo?: any) {
    const timestamp = new Date().toISOString();
    __DEV__ &&
      logger.error(`[${timestamp}] [${context}]`, {
        error: error.message || error,
        stack: error.stack,
        ...additionalInfo,
      });
  }
}

/**
 * Network status checker
 */
export class NetworkMonitor {
  static async checkConnectivity(): Promise<boolean> {
    try {
      await fetch("https://www.google.com", {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-cache",
      });
      return true;
    } catch {
      return false;
    }
  }

  static showNoConnection() {
    Alert.alert(
      "No Internet Connection",
      "Please check your internet connection and try again.",
      [{ text: "OK" }],
    );
  }
}

/**
 * Retry logic for failed operations
 * @deprecated Use utils/retry.ts retryWithBackoff instead
 * This class is kept for backward compatibility only
 */
export class RetryHandler {
  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        __DEV__ && logger.debug(`Attempt ${attempt} failed, retrying...`);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }
}

/**
 * Enhanced error handling with context
 */
