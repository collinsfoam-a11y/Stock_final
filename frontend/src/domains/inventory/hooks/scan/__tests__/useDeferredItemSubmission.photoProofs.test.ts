import { toBackendPhotoProofs } from "../submissionPayload";

describe("toBackendPhotoProofs", () => {
  it("maps photo URIs to backend schema", () => {
    const timestamp = "2026-03-21T12:00:00.000Z";
    const result = toBackendPhotoProofs(
      ["file:///damage.jpg", "https://cdn.example.com/item.png"],
      timestamp,
    );

    expect(result).toEqual([
      {
        id: "photo_1",
        url: "file:///damage.jpg",
        timestamp,
      },
      {
        id: "photo_2",
        url: "https://cdn.example.com/item.png",
        timestamp,
      },
    ]);
  });

  it("skips blank or whitespace-only entries", () => {
    const timestamp = "2026-03-21T12:00:00.000Z";
    const result = toBackendPhotoProofs(
      ["", "   ", "file:///ok.jpg"],
      timestamp,
    );

    expect(result).toEqual([
      {
        id: "photo_1",
        url: "file:///ok.jpg",
        timestamp,
      },
    ]);
  });
});
