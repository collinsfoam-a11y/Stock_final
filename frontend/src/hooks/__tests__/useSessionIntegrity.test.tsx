import { act, renderHook } from "@testing-library/react-native";

import { useSessionIntegrity } from "../useSessionIntegrity";

describe("useSessionIntegrity", () => {
  afterEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    jest.clearAllMocks();
  });

  it("uses the human item name in integrity warnings when versions change", async () => {
    const { result } = renderHook(() =>
      useSessionIntegrity("session-1", [
        {
          item_code: "ITEM001",
          item_name: "Soap Bar",
          version: 1,
          last_modified: "2026-03-21T12:00:00.000Z",
        },
      ]),
    );

    act(() => {
      result.current.takeSnapshot();
    });

    let warnings: Awaited<ReturnType<typeof result.current.checkIntegrity>> | null =
      null;

    await act(async () => {
      warnings = await result.current.checkIntegrity([
        {
          item_code: "ITEM001",
          item_name: "Soap Bar",
          version: 2,
          last_modified: "2026-03-21T12:05:00.000Z",
        },
      ]);
    });

    expect(warnings).toEqual([
      expect.objectContaining({
        item_code: "ITEM001",
        item_name: "Soap Bar",
        warning_type: "master_data_change",
      }),
    ]);
  });
});
