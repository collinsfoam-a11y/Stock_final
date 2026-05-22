const readErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name || "Error"}: ${error.message}`;
  }
  return String(error);
};

export const isLocalDbUnavailableError = (error: unknown): boolean => {
  // Fast path: tagged by our own pre-check throw
  if ((error as any)?.isLocalDbUnavailable === true) return true;

  // DOMException SecurityError thrown by browser for OPFS in non-secure context
  // (also matches when WorkerChannel wraps it: new Error(domException) → message = "SecurityError: …")
  const name = (error as any)?.name;
  if (name === "SecurityError" || name === "NotSupportedError") return true;

  const message = readErrorMessage(error).toLowerCase();
  return (
    // expo-sqlite OPFS VFS errors (web, non-secure context)
    message.includes("navigator.storage not available") ||
    message.includes("invalid vfs state") ||
    message.includes("invalid vfs sttate") ||
    // Browser OPFS blocked (HTTP non-localhost)
    message.includes("the operation is insecure") ||
    message.includes("securityerror") ||
    message.includes("notsupportederror") ||
    message.includes("secure context") ||
    message.includes("storage directory access") ||
    message.includes("opfs") ||
    // TypeError when navigator.storage is undefined
    (message.includes("cannot read properties of undefined") && message.includes("getdirectory")) ||
    (message.includes("cannot read property") && message.includes("getdirectory")) ||
    // expo-sqlite generic unavailability
    message.includes("unable to open database") ||
    message.includes("no such vfs") ||
    // Worker channel wraps errors; match the wrapped form too
    message.includes("failed to initialize accesshandlepoolvfs") ||
    message.includes("failed to initialize wa-sqlite")
  );
};
