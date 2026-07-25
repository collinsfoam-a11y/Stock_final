import { calculateVariance } from "../varianceUtils";

describe("calculateVariance", () => {
  test("returns invalid status for NaN or infinite countedQty", () => {
    expect(calculateVariance(NaN, 5)).toEqual({
      expectedQty: 5,
      countedQty: null,
      variance: null,
      status: "invalid",
      label: "Enter a valid counted quantity",
    });
  });

  test("returns unavailable status when expectedQty is null or infinite", () => {
    expect(calculateVariance(5, null)).toEqual({
      expectedQty: null,
      countedQty: 5,
      variance: null,
      status: "unavailable",
      label: "Expected stock unavailable",
    });
  });

  test("returns balanced status when counted equals expected", () => {
    expect(calculateVariance(5, 5)).toEqual({
      expectedQty: 5,
      countedQty: 5,
      variance: 0,
      status: "balanced",
      label: "Balanced · Expected 5",
    });
  });

  test("normalizes negative zero to positive zero", () => {
    const res = calculateVariance(0, 0);
    expect(res.variance).toBe(0);
    expect(Object.is(res.variance, -0)).toBe(false);
  });

  test("returns surplus status when counted > expected", () => {
    expect(calculateVariance(7, 5)).toEqual({
      expectedQty: 5,
      countedQty: 7,
      variance: 2,
      status: "surplus",
      label: "Surplus +2 · Expected 5",
    });
  });

  test("returns shortage status when counted < expected", () => {
    expect(calculateVariance(3, 5)).toEqual({
      expectedQty: 5,
      countedQty: 3,
      variance: -2,
      status: "shortage",
      label: "Shortage -2 · Expected 5",
    });
  });
});
