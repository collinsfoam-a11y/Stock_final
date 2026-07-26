/**
 * FIX GROUP 2 (frontend) — Conflict resolution strategy tests.
 *
 * The mergeQuantityStrategy regression guard ensures quantities are
 * REPLACED not ADDED when resolving conflicts.
 */

import {
  resolveConflict,
  serverWinsStrategy,
  clientWinsStrategy,
  mergeQuantityStrategy,
} from "./conflictResolution";

describe("Conflict Resolution Strategies", () => {
  const clientData = { id: 1, name: "Item A", quantity: 10 };
  const serverData = { id: 1, name: "Item A", quantity: 20 };

  describe("serverWinsStrategy", () => {
    it("should return server data", () => {
      const result = resolveConflict(clientData, serverData, serverWinsStrategy);
      expect(result).toEqual(serverData);
    });
  });

  describe("clientWinsStrategy", () => {
    it("should return client data", () => {
      const result = resolveConflict(clientData, serverData, clientWinsStrategy);
      expect(result).toEqual(clientData);
    });
  });

  describe("mergeQuantityStrategy — FIX GROUP 2 regression", () => {
    it("server quantity replaces client quantity — never adds", () => {
      // current=10, incoming=20 → must be 20, NOT 10+20=30
      const result = resolveConflict(clientData, serverData, mergeQuantityStrategy) as any;
      expect(result.quantity).toBe(20);
      expect(result.quantity).not.toBe(30); // Additive inflation regression guard
    });

    it("falls back to server data when neither has quantity", () => {
      const badClient = { id: 1, name: "Item A" };
      const badServer = { id: 1, name: "Item A" };
      const result = resolveConflict(badClient, badServer, mergeQuantityStrategy);
      expect(result).toEqual(badServer);
    });

    it("accepts client quantity when server has none (offline-first)", () => {
      const result = resolveConflict(
        { quantity: 7 },
        { status: "pending" },
        mergeQuantityStrategy
      ) as any;
      expect(result.quantity).toBe(7);
    });

    it("server quantity=0 replaces client quantity", () => {
      const result = resolveConflict(
        { quantity: 5 },
        { quantity: 0 },
        mergeQuantityStrategy
      ) as any;
      expect(result.quantity).toBe(0);
    });
  });

  describe("resolveConflict default", () => {
    it("should default to server wins", () => {
      const result = resolveConflict(clientData, serverData);
      expect(result).toEqual(serverData);
    });
  });
});
