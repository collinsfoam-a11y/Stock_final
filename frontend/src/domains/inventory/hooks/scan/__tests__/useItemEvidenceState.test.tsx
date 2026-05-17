import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";

import { useItemEvidenceState } from "../useItemEvidenceState";

describe("useItemEvidenceState", () => {
  it("opens damage photo capture and saves captured URI", () => {
    const { result } = renderHook(() => useItemEvidenceState());

    act(() => {
      result.current.handleTakeDamagePhoto();
    });

    expect(result.current.photoCaptureVisible).toBe(true);
    expect(result.current.photoCaptureTitle).toBe("Capture Damage Photo");

    act(() => {
      result.current.handlePhotoCaptured("file:///tmp/damage.jpg");
    });

    expect(result.current.damagePhoto).toBe("file:///tmp/damage.jpg");
    expect(result.current.photoCaptureVisible).toBe(false);
  });

  it("captures up to three item photos", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const { result } = renderHook(() => useItemEvidenceState());

    act(() => {
      result.current.handleAddItemPhoto();
    });
    act(() => {
      result.current.handlePhotoCaptured("file:///tmp/item-1.jpg");
    });
    act(() => {
      result.current.handleAddItemPhoto();
    });
    act(() => {
      result.current.handlePhotoCaptured("file:///tmp/item-2.jpg");
    });
    act(() => {
      result.current.handleAddItemPhoto();
    });
    act(() => {
      result.current.handlePhotoCaptured("file:///tmp/item-3.jpg");
    });
    act(() => {
      result.current.handleAddItemPhoto();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Photo Limit",
      "Maximum 3 item photos can be attached.",
    );
    expect(result.current.photoCaptureVisible).toBe(false);

    expect(result.current.itemPhotos).toEqual([
      "file:///tmp/item-1.jpg",
      "file:///tmp/item-2.jpg",
      "file:///tmp/item-3.jpg",
    ]);
  });
});
