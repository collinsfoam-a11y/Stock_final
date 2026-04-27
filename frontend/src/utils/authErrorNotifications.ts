import { formatBackendValidationDetail } from "@/domains/inventory/hooks/scan/errorMessages";
import { normalizeAuthApiError } from "@/utils/authApiErrors";

type LoginMode = "pin" | "credentials";

type LoginResult = {
  success: boolean;
  message?: string;
  code?: string;
  retryAfter?: number;
};

export type AuthNotificationTone = "error" | "warning" | "info" | "success";

export type AuthNotificationAction =
  | "change_username"
  | "retry"
  | "sign_in"
  | "fix_form"
  | "check_network"
  | "wait"
  | "switch_to_credentials"
  | null;

export type AuthNotification = {
  title: string;
  message: string;
  action: AuthNotificationAction;
  tone: AuthNotificationTone;
};

export type AuthRouteNoticeKey = "registration_closed";

export type RegistrationFieldName =
  | "username"
  | "full_name"
  | "password"
  | "confirmPassword"
  | "employee_id"
  | "phone";

export type RegistrationFieldErrors = Partial<
  Record<RegistrationFieldName, string>
>;

const GENERIC_TRANSPORT_MESSAGES = [
  "request failed with status code",
  "network error",
  "failed to fetch",
  "network request failed",
  "cannot connect",
];

const ROUTE_NOTICE_MESSAGES: Record<AuthRouteNoticeKey, AuthNotification> = {
  registration_closed: {
    title: "Account Creation Closed",
    message:
      "This workspace is already set up. Sign in and ask an administrator to create your account.",
    action: null,
    tone: "info",
  },
};

const REGISTER_FIELD_LABELS: Record<RegistrationFieldName, string> = {
  username: "Username",
  full_name: "Full Name",
  password: "Password",
  confirmPassword: "Confirm Password",
  employee_id: "Employee ID",
  phone: "Phone Number",
};

const ensureSentence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
};

const isGenericTransportMessage = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return GENERIC_TRANSPORT_MESSAGES.some((snippet) =>
    normalized.includes(snippet),
  );
};

const AUTH_NOTICE_PRIORITIES: Record<AuthNotificationTone, number> = {
  success: 0,
  info: 1,
  warning: 2,
  error: 3,
};

const normalizeRegisterFieldName = (value: string): RegistrationFieldName | null => {
  switch (value) {
    case "username":
    case "full_name":
    case "password":
    case "employee_id":
    case "phone":
      return value;
    case "confirm_password":
    case "confirmPassword":
      return "confirmPassword";
    default:
      return null;
  }
};

const formatRegisterFieldMessage = (
  field: RegistrationFieldName,
  rawMessage: unknown,
): string | null => {
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    return null;
  }

  const label = REGISTER_FIELD_LABELS[field];
  const message = rawMessage.trim();

  if (/^field required$/i.test(message)) {
    return ensureSentence(`${label} is required`);
  }

  if (/^input should be at least /i.test(message)) {
    return ensureSentence(
      `${label} ${message.replace(/^input should be/i, "must be").trim()}`,
    );
  }

  if (/^input should be greater than 0$/i.test(message)) {
    return ensureSentence(`${label} must be greater than 0`);
  }

  if (/^value error, /i.test(message)) {
    return ensureSentence(message.replace(/^value error, /i, ""));
  }

  return ensureSentence(
    `${label}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`,
  );
};

const extractLastStringFromLoc = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const segment = [...value].reverse().find((item) => typeof item === "string");
  return typeof segment === "string" ? segment : null;
};

const getRestrictedNetworkMessage = () =>
  "This app only works on the permitted local network. Connect to that network and try again.";

const getConnectionIssueMessage = () =>
  "We couldn't reach the server. Check your connection and try again.";

const getTimeoutMessage = () =>
  "The server is taking too long to respond. Check your connection and try again.";

const formatRetryAfter = (retryAfter?: number): string | null => {
  if (!retryAfter || retryAfter <= 0) {
    return null;
  }

  if (retryAfter < 60) {
    return ensureSentence(`Wait about ${retryAfter} seconds, then try again`);
  }

  const minutes = Math.ceil(retryAfter / 60);
  return ensureSentence(
    `Wait about ${minutes} minute${minutes === 1 ? "" : "s"}, then try again`,
  );
};

const summarizeFieldErrors = (
  fieldErrors: RegistrationFieldErrors,
): string | null => {
  const messages = Object.values(fieldErrors).filter(
    (message): message is string => typeof message === "string" && message.length > 0,
  );
  return messages.length > 0 ? messages.join("\n") : null;
};

export const pickPreferredAuthNotice = (
  current: AuthNotification | null,
  incoming: AuthNotification | null,
): AuthNotification | null => {
  if (!current) return incoming;
  if (!incoming) return current;

  return AUTH_NOTICE_PRIORITIES[incoming.tone] >=
    AUTH_NOTICE_PRIORITIES[current.tone]
    ? incoming
    : current;
};

export const getOfflineAuthNotice = (
  context: "login" | "register",
): AuthNotification => ({
  title: "Offline",
  message:
    context === "login"
      ? "Sign in requires a live connection to the store network. Reconnect and try again."
      : "Account creation requires a live connection to the store network. Reconnect and try again.",
  action: "check_network",
  tone: "warning",
});

export const getAuthRouteNotice = (
  noticeKey: string | string[] | undefined,
): AuthNotification | null => {
  if (!noticeKey) return null;
  const key = Array.isArray(noticeKey) ? noticeKey[0] : noticeKey;
  return key && key in ROUTE_NOTICE_MESSAGES
    ? ROUTE_NOTICE_MESSAGES[key as AuthRouteNoticeKey]
    : null;
};

export const getRegistrationFieldErrors = (
  error: unknown,
): RegistrationFieldErrors => {
  const parsed = normalizeAuthApiError(error);
  const normalizedFields = parsed.fields;
  const fieldErrors: RegistrationFieldErrors = {};

  if (Object.keys(normalizedFields).length > 0) {
    Object.entries(normalizedFields).forEach(([fieldName, message]) => {
      const normalizedField = normalizeRegisterFieldName(fieldName);
      if (!normalizedField || fieldErrors[normalizedField]) {
        return;
      }

      const formattedMessage = formatRegisterFieldMessage(
        normalizedField,
        message,
      );
      if (formattedMessage) {
        fieldErrors[normalizedField] = formattedMessage;
      }
    });

    return fieldErrors;
  }

  const detail = parsed.detail;
  if (!Array.isArray(detail)) {
    return {};
  }

  detail.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const typedEntry = entry as {
      loc?: unknown;
      msg?: unknown;
    };

    const fieldName = extractLastStringFromLoc(typedEntry.loc);
    if (!fieldName) {
      return;
    }

    const normalizedField = normalizeRegisterFieldName(fieldName);
    if (!normalizedField || fieldErrors[normalizedField]) {
      return;
    }

    const message = formatRegisterFieldMessage(normalizedField, typedEntry.msg);
    if (message) {
      fieldErrors[normalizedField] = message;
    }
  });

  return fieldErrors;
};

export const getLoginErrorNotification = (
  result: LoginResult,
  mode: LoginMode,
): AuthNotification => {
  if (result.code === "AUTH_SESSION_CONFLICT") {
    return {
      title: "Session Already Active",
      message:
        "This account is already signed in on another device. Ask your administrator to end the other session, then try again.",
      action: null,
      tone: "warning",
    };
  }

  if (result.code === "AUTH_INVALID_CREDENTIALS") {
    return mode === "credentials"
      ? {
        title: "Incorrect Sign-In Details",
        message:
          result.message || "The username or password is incorrect. Try again.",
        action: null,
        tone: "error",
      }
      : {
        title: "Incorrect PIN",
        message: result.message || "That PIN is not correct. Try again.",
        action: null,
        tone: "error",
      };
  }

  if (result.code === "AUTH_VALIDATION_ERROR") {
    return {
      title: "Check Sign-In Details",
      message:
        result.message ||
        "Some sign-in details are missing or invalid. Review the form and try again.",
      action: "fix_form",
      tone: "warning",
    };
  }

  if (result.code === "AUTH_USERNAME_REQUIRED_FOR_PIN_LOGIN") {
    return {
      title: "Use Password Sign-In First",
      message:
        "Sign in with your username and password first. After that, you can use PIN sign-in on this device.",
      action: "switch_to_credentials",
      tone: "info",
    };
  }

  if (result.code === "AUTH_ACCESS_DENIED" || result.code === "ACCOUNT_DISABLED") {
    if (result.code === "ACCOUNT_DISABLED" || /deactivated/i.test(result.message || "")) {
      return {
        title: "Account Disabled",
        message:
          "This account is currently disabled. Contact your administrator for access.",
        action: null,
        tone: "warning",
      };
    }

    return {
      title: "Access Denied",
      message:
        result.message ||
        "You do not currently have permission to sign in here.",
      action: null,
      tone: "warning",
    };
  }

  if (result.code === "AUTH_RATE_LIMITED") {
    return {
      title: "Too Many Attempts",
      message:
        formatRetryAfter(result.retryAfter) ||
        result.message ||
        "Too many sign-in attempts were made. Wait a moment, then try again.",
      action: "wait",
      tone: "warning",
    };
  }

  if (result.code === "NETWORK_NOT_ALLOWED") {
    return {
      title: "Restricted Network",
      message: getRestrictedNetworkMessage(),
      action: "check_network",
      tone: "warning",
    };
  }

  if (result.code === "NETWORK_TIMEOUT") {
    return {
      title: "Slow Connection",
      message: result.message || getTimeoutMessage(),
      action: "retry",
      tone: "warning",
    };
  }

  if (result.code === "NETWORK_CONNECTION_ERROR") {
    return {
      title: "Can't Reach Server",
      message: result.message || getConnectionIssueMessage(),
      action: "check_network",
      tone: "warning",
    };
  }

  if (result.code === "SERVER_ERROR") {
    return {
      title: "Server Busy",
      message:
        result.message ||
        "The server is having trouble right now. Please try again shortly.",
      action: "retry",
      tone: "warning",
    };
  }

  return {
    title: mode === "pin" ? "PIN Sign-In Failed" : "Sign-In Failed",
    message:
      result.message ||
      (mode === "pin"
        ? "We couldn't sign you in with your PIN. Please try again."
        : "We couldn't sign you in right now. Please try again."),
    action: null,
    tone: "error",
  };
};

export const getRegistrationErrorNotification = (
  error: unknown,
): AuthNotification => {
  const parsed = normalizeAuthApiError(error);
  const validationMessage =
    summarizeFieldErrors(getRegistrationFieldErrors(error)) ||
    formatBackendValidationDetail(parsed.detail);

  if (
    parsed.code === "AUTH_USERNAME_EXISTS" ||
    /already exists/i.test(parsed.message || "")
  ) {
    return {
      title: "Username Taken",
      message:
        "That username is already in use. Choose a different username and try again.",
      action: "change_username",
      tone: "error",
    };
  }

  if (parsed.status === 422) {
    return {
      title: "Check Your Details",
      message:
        validationMessage ||
        "Some registration details are missing or invalid. Review the form and try again.",
      action: "fix_form",
      tone: "warning",
    };
  }

  if (parsed.status === 403 && parsed.code === "ADMIN_REQUIRED") {
    return {
      title: "Registration Closed",
      message:
        "This workspace is already set up. Sign in and ask an administrator to create your account.",
      action: "sign_in",
      tone: "info",
    };
  }

  if (parsed.status === 403 && parsed.code === "NETWORK_NOT_ALLOWED") {
    return {
      title: "Restricted Network",
      message: getRestrictedNetworkMessage(),
      action: "check_network",
      tone: "warning",
    };
  }

  if (parsed.status === 429 || parsed.code === "RATE_LIMIT_ERROR") {
    return {
      title: "Too Many Attempts",
      message:
        formatRetryAfter(parsed.retryAfter) ||
        parsed.message ||
        "Too many registration attempts were made. Wait a moment, then try again.",
      action: "wait",
      tone: "warning",
    };
  }

  if (
    parsed.transportCode === "ECONNABORTED" ||
    /timeout/i.test(parsed.message || "")
  ) {
    return {
      title: "Slow Connection",
      message: getTimeoutMessage(),
      action: "retry",
      tone: "warning",
    };
  }

  if (!parsed.hasResponse) {
    return {
      title: "Can't Reach Server",
      message: getConnectionIssueMessage(),
      action: "check_network",
      tone: "warning",
    };
  }

  if (typeof parsed.status === "number" && parsed.status >= 500) {
    return {
      title: "Server Busy",
      message:
        "We couldn't create the account right now. Please try again shortly.",
      action: "retry",
      tone: "warning",
    };
  }

  if (parsed.message && !isGenericTransportMessage(parsed.message)) {
    return {
      title: "Registration Failed",
      message: ensureSentence(parsed.message),
      action: null,
      tone: "error",
    };
  }

  return {
    title: "Registration Failed",
    message: "We couldn't create the account right now. Please try again.",
    action: null,
    tone: "error",
  };
};
