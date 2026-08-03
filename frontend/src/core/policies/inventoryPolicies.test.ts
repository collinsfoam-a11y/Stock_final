import { enforceCountLinePolicies, InventoryPolicyError } from "./inventoryPolicies";

describe("inventoryPolicies", () => {
  it("rejects serialized quantities that do not match the serial count", () => {
    expect(() =>
      enforceCountLinePolicies({
        session_id: "session-1",
        item_code: "ITEM001",
        counted_qty: 2,
        serial_numbers: ["SER-1"],
      })
    ).toThrow(InventoryPolicyError);
  });

  it("rejects fractional NOS quantities", () => {
    expect(() =>
      enforceCountLinePolicies(
        {
          session_id: "session-1",
          item_code: "ITEM001",
          counted_qty: 1.5,
        },
        { uom: "NOS" }
      )
    ).toThrow("Fractional quantity is not allowed for NOS items.");
  });

  it("accepts valid integer serialized quantities", () => {
    expect(() =>
      enforceCountLinePolicies({
        session_id: "session-1",
        item_code: "ITEM001",
        counted_qty: 2,
        serial_numbers: ["SER-1", "SER-2"],
      })
    ).not.toThrow();
  });
});
