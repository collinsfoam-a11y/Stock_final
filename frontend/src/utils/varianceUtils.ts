export type VarianceStatus =
  | "balanced"
  | "surplus"
  | "shortage"
  | "unavailable"
  | "invalid";

export type VarianceState = {
  expectedQty: number | null;
  countedQty: number | null;
  variance: number | null;
  status: VarianceStatus;
  label: string;
};

export function calculateVariance(
  countedQty: number,
  expectedQty: number | null,
): VarianceState {
  if (!Number.isFinite(countedQty)) {
    return {
      expectedQty:
        expectedQty !== null && Number.isFinite(expectedQty)
          ? expectedQty
          : null,
      countedQty: null,
      variance: null,
      status: "invalid",
      label: "Enter a valid counted quantity",
    };
  }

  if (expectedQty === null || !Number.isFinite(expectedQty)) {
    return {
      expectedQty: null,
      countedQty,
      variance: null,
      status: "unavailable",
      label: "Expected stock unavailable",
    };
  }

  const rawVariance = countedQty - expectedQty;
  const variance = Object.is(rawVariance, -0) ? 0 : rawVariance;

  if (variance === 0) {
    return {
      expectedQty,
      countedQty,
      variance,
      status: "balanced",
      label: `Balanced · Expected ${expectedQty}`,
    };
  }

  if (variance > 0) {
    return {
      expectedQty,
      countedQty,
      variance,
      status: "surplus",
      label: `Surplus +${variance} · Expected ${expectedQty}`,
    };
  }

  return {
    expectedQty,
    countedQty,
    variance,
    status: "shortage",
    label: `Shortage ${variance} · Expected ${expectedQty}`,
  };
}
