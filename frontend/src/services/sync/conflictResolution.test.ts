import {
  resolveConflict,
  serverWinsStrategy,
  clientWinsStrategy,
  mergeQuantityStrategy,
} from "./conflictResolution";

describe("Conflict Resolution Strategies", () => {
  const clientData = { id: 1, name: "Item A", delta: 10, quantity: 10 };
  const serverData = { id: 1, name: "Item A", delta: 0, quantity: 20 };

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

  describe("mergeQuantityStrategy", () => {
    it("should apply client delta on top of the server quantity", () => {
      const result = resolveConflict(clientData, serverData, mergeQuantityStrategy);
      expect(result).toEqual({ ...serverData, quantity: 30 });
    });

    it("should fallback to server wins if delta is missing", () => {
      const badClient = { id: 1, name: "Item A" };
      const badServer = { id: 1, name: "Item A" };
      const result = resolveConflict(badClient, badServer, mergeQuantityStrategy);
      expect(result).toEqual(badServer);
    });
  });

  describe("resolveConflict default", () => {
    it("should default to server wins", () => {
      const result = resolveConflict(clientData, serverData);
      expect(result).toEqual(serverData);
    });
  });
});
