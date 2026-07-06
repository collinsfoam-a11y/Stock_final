/**
 * Safe Render Utilities
 * Helper functions to prevent crashes during rendering
 */

import React, { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Safely render a component with error boundary
 */
export function safeRender(component: () => ReactNode, fallback?: ReactNode): ReactNode {
  try {
    return component();
  } catch (error) {
    __DEV__ && console.error("Render error caught:", error);
    return fallback || null;
  }
}

/**
 * Wrap component with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: (error: Error) => ReactNode
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback ? (error) => fallback(error) : undefined}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Safe async operation wrapper
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback?: T,
  onError?: (error: Error) => void
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const requestError = err as Error & {
      isAxiosError?: boolean;
      config?: unknown;
      request?: unknown;
      response?: unknown;
      code?: string;
      name?: string;
    };
    const isHandledRequestError = Boolean(
      requestError.isAxiosError ||
      requestError.config ||
      requestError.request ||
      requestError.response ||
      requestError.code === "ERR_CANCELED" ||
      requestError.code === "ERR_NETWORK" ||
      requestError.name === "AbortError"
    );
    // AppErrors flagged user-facing/network are expected control-flow outcomes
    // (e.g. "item not found") that the caller already surfaces to the user.
    // Logging them at error severity trips the dev redbox and inflates
    // production error monitoring for non-bugs.
    const isExpectedAppError = Boolean(
      (requestError as { name?: string }).name === "AppError" &&
        (requestError as { isUserFacing?: boolean }).isUserFacing
    );
    if (__DEV__ && !isHandledRequestError && !isExpectedAppError) {
      console.error("Safe async error:", err);
    }
    if (onError) {
      onError(err);
    }
    return fallback;
  }
}

/**
 * Safe value getter with fallback
 */
export function safeGet<T>(getter: () => T, fallback: T): T {
  try {
    return getter();
  } catch (error) {
    __DEV__ && console.error("Safe get error:", error);
    return fallback;
  }
}
