/**
 * Conflict Resolution Strategies
 */

export interface ConflictStrategy {
  resolve<T>(clientData: T, serverData: T): T;
}

/**
 * Server Wins Strategy
 * The server's version of the data is always accepted.
 */
export const serverWinsStrategy: ConflictStrategy = {
  resolve: (_clientData, serverData) => serverData,
};

/**
 * Client Wins Strategy
 * The client's version of the data overwrites the server.
 */
export const clientWinsStrategy: ConflictStrategy = {
  resolve: (clientData, _serverData) => clientData,
};

/**
 * Merge Strategy (for numeric quantities)
 *
 * FIX GROUP 2 (frontend counterpart): Quantities are absolute values, not deltas.
 * The authoritative value from the server always wins for inventory counts.
 * Use clientData.quantity directly when no server quantity is present.
 *
 * If callers genuinely need delta semantics they must compute the delta
 * themselves before calling this resolver.
 */
export const mergeQuantityStrategy: ConflictStrategy = {
  resolve: (clientData: any, serverData: any) => {
    // Server quantity is the authoritative absolute value.
    if (typeof serverData.quantity === "number") {
      return { ...serverData };
    }
    // No server quantity: accept client value as-is (offline-first safety net).
    if (typeof clientData.quantity === "number") {
      return { ...serverData, quantity: clientData.quantity };
    }
    return serverData;
  },
};

/**
 * Default resolver
 */
export const resolveConflict = <T>(
  clientData: T,
  serverData: T,
  strategy: ConflictStrategy = serverWinsStrategy
): T => {
  return strategy.resolve(clientData, serverData);
};
