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
 * Uses additive delta semantics when the client sends an explicit delta.
 * If there is no delta, we fall back to server data rather than guessing.
 */
export const mergeQuantityStrategy: ConflictStrategy = {
  resolve: (clientData: any, serverData: any) => {
    if (typeof clientData.delta === "number" && typeof serverData.quantity === "number") {
      return {
        ...serverData,
        quantity: serverData.quantity + clientData.delta,
      };
    }
    return serverData; // Fallback to server wins
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
