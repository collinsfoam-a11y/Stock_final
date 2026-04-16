import { formatBackendValidationDetail, getReadableInventoryErrorMessage } from "../errorMessages";

describe("scan error messages", () => {
  it("formats backend validation details into plain-language guidance", () => {
    expect(
      formatBackendValidationDetail([
        {
          loc: ["body", "counted_qty"],
          msg: "Input should be greater than 0",
        },
        {
          loc: ["body", "serial_entries", 0, "serial_number"],
          msg: "Field required",
        },
      ])
    ).toBe("Quantity must be greater than 0.\nSerial number is required.");
  });

  it("turns technical request failures into clear save-count guidance", () => {
    expect(
      getReadableInventoryErrorMessage(
        {
          response: {
            status: 500,
          },
          message: "Request failed with status code 500",
        },
        "save-count"
      )
    ).toBe("We couldn't save the count right now. Please try again.");
  });

  it("uses a friendly network message when item loading times out", () => {
    expect(
      getReadableInventoryErrorMessage(
        {
          code: "ECONNABORTED",
          message: "timeout of 10000ms exceeded",
        },
        "load-item"
      )
    ).toBe("The item request timed out. Check your connection and try again.");
  });
});
