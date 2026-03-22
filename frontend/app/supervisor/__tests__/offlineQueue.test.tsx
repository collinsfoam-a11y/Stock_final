import { summarizeForceSyncResult } from "../offlineQueueFeedback";

describe("summarizeForceSyncResult", () => {
  it("reports partial failures instead of a blanket success message", () => {
    expect(
      summarizeForceSyncResult({
        success: 2,
        failed: 1,
        total: 3,
        errors: [{ id: "line-3", error: "Conflict detected" }],
      }),
    ).toEqual({
      title: "Partial Sync",
      message: "2 of 3 queued actions synced. 1 action still needs attention.",
      loadAfterAlert: true,
    });
  });

  it("reports a full success only when all queued actions sync cleanly", () => {
    expect(
      summarizeForceSyncResult({
        success: 3,
        failed: 0,
        total: 3,
        errors: [],
      }),
    ).toEqual({
      title: "Success",
      message: "Offline queue synced successfully",
      loadAfterAlert: true,
    });
  });
});
