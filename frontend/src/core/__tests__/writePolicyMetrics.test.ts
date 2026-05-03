import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { storage } from "../../services/storage/asyncStorageService";
import {
  clearWritePolicyMetrics,
  getWritePolicyMetrics,
  recordWritePolicyDecision,
} from "../writePolicyMetrics";

jest.mock("../../services/storage/asyncStorageService", () => ({
  storage: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

describe("writePolicyMetrics", () => {
  type MockFn = jest.MockedFunction<(...args: any[]) => any>;
  const mockedStorage = storage as unknown as {
    get: MockFn;
    set: MockFn;
    remove: MockFn;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.get.mockResolvedValue({
      directWrites: 0,
      queuedWrites: 0,
      blockedWrites: 0,
      updatedAt: null,
    });
    mockedStorage.set.mockResolvedValue(true);
    mockedStorage.remove.mockResolvedValue(true);
  });

  it("returns normalized defaults", async () => {
    mockedStorage.get.mockResolvedValue(null);
    const metrics = await getWritePolicyMetrics();

    expect(metrics).toEqual({
      directWrites: 0,
      queuedWrites: 0,
      blockedWrites: 0,
      updatedAt: null,
    });
  });

  it("records DIRECT decisions", async () => {
    await recordWritePolicyDecision("DIRECT");

    expect(storage.set).toHaveBeenCalledWith(
      "write_policy_metrics_v1",
      expect.objectContaining({
        directWrites: 1,
        queuedWrites: 0,
        blockedWrites: 0,
      })
    );
  });

  it("records ENQUEUE decisions", async () => {
    await recordWritePolicyDecision("ENQUEUE");

    expect(storage.set).toHaveBeenCalledWith(
      "write_policy_metrics_v1",
      expect.objectContaining({
        directWrites: 0,
        queuedWrites: 1,
        blockedWrites: 0,
      })
    );
  });

  it("records BLOCK decisions", async () => {
    await recordWritePolicyDecision("BLOCK");

    expect(storage.set).toHaveBeenCalledWith(
      "write_policy_metrics_v1",
      expect.objectContaining({
        directWrites: 0,
        queuedWrites: 0,
        blockedWrites: 1,
      })
    );
  });

  it("clears metrics storage", async () => {
    await clearWritePolicyMetrics();

    expect(storage.remove).toHaveBeenCalledWith("write_policy_metrics_v1");
  });
});
