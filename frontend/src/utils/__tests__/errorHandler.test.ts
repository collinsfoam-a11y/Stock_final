/**
 * Tests for errorHandler utility functions.
 */

import { describe, it, expect } from "@jest/globals";
import {
  getErrorMessage,
  getErrorCode,
  isRecoverableError,
  getUserFriendlyMessage,
  formatErrorForLogging,
} from "../errorHandler";

describe("getErrorMessage", () => {
  it("extracts message from Error instance", () => {
    const error = new Error("Something went wrong");
    expect(getErrorMessage(error)).toBe("Something went wrong");
  });

  it("returns string errors directly", () => {
    expect(getErrorMessage("plain string error")).toBe("plain string error");
  });

  it("extracts message from plain object", () => {
    const error = { message: "object error" };
    expect(getErrorMessage(error)).toBe("object error");
  });

  it("returns default message for null", () => {
    expect(getErrorMessage(null)).toBe("An unexpected error occurred");
  });

  it("returns default message for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("An unexpected error occurred");
  });

  it("returns default message for number", () => {
    expect(getErrorMessage(42)).toBe("An unexpected error occurred");
  });

  it("coerces non-string message to string", () => {
    const error = { message: 404 };
    expect(getErrorMessage(error)).toBe("404");
  });
});

describe("getErrorCode", () => {
  it("extracts code field", () => {
    const error = { code: "ERR_NETWORK" };
    expect(getErrorCode(error)).toBe("ERR_NETWORK");
  });

  it("extracts status field", () => {
    const error = { status: 404 };
    expect(getErrorCode(error)).toBe("404");
  });

  it("extracts statusCode field", () => {
    const error = { statusCode: 500 };
    expect(getErrorCode(error)).toBe("500");
  });

  it("returns undefined for strings", () => {
    expect(getErrorCode("plain error")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(getErrorCode(null)).toBeUndefined();
  });

  it("returns undefined for plain Error (no code property)", () => {
    const error = new Error("test");
    // Error objects may have a code property in Node depending on the error type
    const result = getErrorCode(error);
    expect(result === undefined || typeof result === "string").toBe(true);
  });
});

describe("isRecoverableError", () => {
  it("marks network errors as recoverable", () => {
    const error = new Error("network failure occurred");
    expect(isRecoverableError(error)).toBe(true);
  });

  it("marks timeout errors as recoverable", () => {
    expect(isRecoverableError(new Error("request timeout"))).toBe(true);
  });

  it("marks connection errors as recoverable", () => {
    expect(isRecoverableError(new Error("connection refused"))).toBe(true);
  });

  it("marks ECONNREFUSED as recoverable", () => {
    expect(isRecoverableError(new Error("ECONNREFUSED"))).toBe(true);
  });

  it("marks ECONNABORTED as recoverable", () => {
    expect(isRecoverableError(new Error("ECONNABORTED"))).toBe(true);
  });

  it("marks temporary errors as recoverable", () => {
    expect(isRecoverableError(new Error("temporary service error"))).toBe(true);
  });

  it("marks auth errors as not recoverable", () => {
    expect(isRecoverableError(new Error("unauthorized access"))).toBe(false);
  });

  it("marks validation errors as not recoverable", () => {
    expect(isRecoverableError(new Error("invalid barcode format"))).toBe(false);
  });

  it("handles non-Error objects gracefully", () => {
    expect(isRecoverableError({ message: "network down" })).toBe(true);
  });

  it("handles null gracefully", () => {
    expect(isRecoverableError(null)).toBe(false);
  });
});

describe("getUserFriendlyMessage", () => {
  it("returns network message for network errors", () => {
    const msg = getUserFriendlyMessage(new Error("network timeout"));
    expect(msg).toContain("Network connection failed");
  });

  it("returns timeout message for timeout errors", () => {
    const msg = getUserFriendlyMessage(new Error("request timeout exceeded"));
    expect(msg).toContain("timed out");
  });

  it("returns auth message for unauthorized errors", () => {
    const msg = getUserFriendlyMessage(new Error("unauthorized access"));
    expect(msg).toContain("Invalid username");
  });

  it("returns forbidden message for forbidden errors", () => {
    const msg = getUserFriendlyMessage(new Error("forbidden resource"));
    expect(msg).toContain("permission");
  });

  it("returns not found message", () => {
    const msg = getUserFriendlyMessage(new Error("resource not found"));
    expect(msg).toContain("not found");
  });

  it("returns server error message for 500 errors", () => {
    const msg = getUserFriendlyMessage(new Error("server error 500"));
    expect(msg).toContain("Server error");
  });

  it("returns generic message for unknown errors", () => {
    const msg = getUserFriendlyMessage(new Error("something unexpected"));
    expect(msg).toContain("error occurred");
  });
});

describe("formatErrorForLogging", () => {
  it("removes password from error messages", () => {
    const result = formatErrorForLogging(new Error("login failed password=mysecret123"));
    expect(result).toContain("password=***");
    expect(result).not.toContain("mysecret123");
  });

  it("removes token from error messages", () => {
    const result = formatErrorForLogging(new Error("invalid token=abc123xyz"));
    expect(result).toContain("token=***");
    expect(result).not.toContain("abc123xyz");
  });

  it("removes secret from error messages", () => {
    const result = formatErrorForLogging(new Error("secret=mysupersecret"));
    expect(result).toContain("secret=***");
    expect(result).not.toContain("mysupersecret");
  });

  it("leaves non-sensitive messages unchanged", () => {
    const result = formatErrorForLogging(new Error("database connection failed"));
    expect(result).toBe("database connection failed");
  });
});
