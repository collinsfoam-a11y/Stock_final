import React from "react";
import { render } from "@testing-library/react-native";

import { VariancePanel } from "../VariancePanel";
import type { VarianceViewModel } from "@/viewModels/types";

// Minimal token mock covering every key VariancePanel reads.
jest.mock("@/hooks/useUiTokens", () => ({
    useUiTokens: () => ({
        mode: "light",
        colors: {
            accent: "#2563eb",
            error: "#dc2626",
            warning: "#d97706",
            success: "#16a34a",
            textPrimary: "#0f172a",
            textSecondary: "#475569",
            textMuted: "#94a3b8",
            surface: "#ffffff",
            border: "#e2e8f0",
        },
        spacing: { xxs: 2, xs: 4, sm: 8, md: 16 },
        radius: { sm: 6, md: 10, lg: 14, full: 9999 },
    }),
}));

// colorWithAlpha is pure string math; stub to keep snapshots stable.
jest.mock("@/theme/themeTokens", () => ({
    colorWithAlpha: (hex: string, _alpha: number) => hex,
}));

const baseVm: VarianceViewModel = {
    itemCode: "ITEM-001",
    itemName: "Steel Rod 12mm",
    baseline: { value: 120, source: "Session snapshot" },
    movementAdjustedExpected: { value: 118, source: "baseline ± movements" },
    currentErp: { value: 118, source: "SQL verification", isCachedErp: false },
    physical: { value: 115, source: "Counted" },
    quantityDelta: -3,
    auditDelta: -5,
    operationalDelta: -3,
    shortageQty: 3,
    excessQty: 0,
    classification: "REAL_VARIANCE",
    severity: "critical",
    explanation: "Physical count is below the movement-adjusted expectation.",
    location: { floor: "F1", rack: "R2" },
};

describe("VariancePanel", () => {
    it("renders item identity and location", () => {
        const { getByText } = render(<VariancePanel vm={baseVm} />);
        expect(getByText("Steel Rod 12mm")).toBeTruthy();
        expect(getByText("ITEM-001")).toBeTruthy();
        expect(getByText("F1 · R2")).toBeTruthy();
    });

    it("renders canonical deltas with explicit signs", () => {
        const { getByText, getAllByText } = render(<VariancePanel vm={baseVm} />);
        // Quantity Δ = -3 and Operational Δ = -3 both render (two occurrences).
        expect(getAllByText("-3").length).toBe(2);
        // Audit Δ = -5 is unique.
        expect(getByText("-5")).toBeTruthy();
        // Excess = 0 is a valid value and must render as "0", not "—"
        expect(getByText("0")).toBeTruthy();
    });

    it("renders provenance captions for reference quantities", () => {
        const { getByText } = render(<VariancePanel vm={baseVm} />);
        expect(getByText("Session snapshot")).toBeTruthy();
        expect(getByText("baseline ± movements")).toBeTruthy();
    });

    it("renders absence as — and never coerces to 0", () => {
        const vm: VarianceViewModel = {
            ...baseVm,
            currentErp: { value: null, absence: "pending_sql_validation" },
            operationalDelta: null,
        };
        const { getAllByText, getByText } = render(<VariancePanel vm={vm} />);
        // "—" appears for the absent current ERP value and the absent delta.
        const dashes = getAllByText("—");
        expect(dashes.length).toBeGreaterThanOrEqual(2);
        // Absence caption is surfaced (never coerced to "0").
        expect(getByText("Awaiting SQL validation")).toBeTruthy();
    });

    it("renders the cached-ERP badge when currentErp is cached (VI-01)", () => {
        const vm: VarianceViewModel = {
            ...baseVm,
            currentErp: { value: 119, source: "ERP cache", isCachedErp: true },
        };
        const { getByText } = render(<VariancePanel vm={vm} />);
        expect(getByText("cached")).toBeTruthy();
    });

    it("renders the classification + severity banner", () => {
        const { getByText } = render(<VariancePanel vm={baseVm} />);
        expect(getByText("Real variance · Critical")).toBeTruthy();
        expect(getByText(baseVm.explanation)).toBeTruthy();
    });
});
