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
 * H16 fix: Use the higher quantity (last-write-wins for stock counts).
 * In a stock verification system, both sides counted the same physical items,
 * so we take the maximum rather than summing (which would double inventory).
 * Assumes data has a 'quantity' field.
 */
export const mergeQuantityStrategy: ConflictStrategy = {
  resolve: (clientData: any, serverData: any) => {
    if (
      typeof clientData.quantity === "number" &&
      typeof serverData.quantity === "number"
    ) {
      return {
        ...serverData,
        quantity: Math.max(serverData.quantity, clientData.quantity),
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
  strategy: ConflictStrategy = serverWinsStrategy,
): T => {
  return strategy.resolve(clientData, serverData);
};
