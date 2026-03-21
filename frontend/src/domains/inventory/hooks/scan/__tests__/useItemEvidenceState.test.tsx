import { act, renderHook } from "@testing-library/react-native";

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
    const { result } = renderHook(() => useItemEvidenceState());

    act(() => {
      result.current.handleAddItemPhoto();
      result.current.handlePhotoCaptured("file:///tmp/item-1.jpg");
      result.current.handleAddItemPhoto();
      result.current.handlePhotoCaptured("file:///tmp/item-2.jpg");
      result.current.handleAddItemPhoto();
      result.current.handlePhotoCaptured("file:///tmp/item-3.jpg");
      result.current.handleAddItemPhoto();
      result.current.handlePhotoCaptured("file:///tmp/item-4.jpg");
    });

    expect(result.current.itemPhotos).toEqual([
      "file:///tmp/item-1.jpg",
      "file:///tmp/item-2.jpg",
      "file:///tmp/item-3.jpg",
    ]);
  });
});
