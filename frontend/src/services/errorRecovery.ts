export const handleErrorWithRecovery = async (
  operation: () => Promise<any>,
  options: any,
) => {
  try {
    return await operation();
  } catch (error: any) {
    // Don't show generic alert if caller handles it, or show specific message
    const typedError =
      error instanceof Error ? error : new Error(String(error));
    if (options?.showAlert) {
      // Use a more specific message if available, but prefer letting caller handle UI
      // console.warn("handleErrorWithRecovery caught error:", typedError);
    }
    throw typedError;
  }
};

export const errorReporter = {
  report: (error: Error, source?: string, context?: Record<string, any>) => {
    console.error("Error reported:", { error, source, context });
  },
  captureException: (error: Error, context?: Record<string, any>) => {
    console.error("Exception captured:", error, context);
  },
};
