import React from "react";
import { render } from "@testing-library/react-native";

import { BaselineIntegrityBanner } from "../BaselineIntegrityBanner";
import { StaleStateBadge } from "../StaleStateBadge";
import { toBaselineIntegrityViewModel, type BaselineDTO } from "@/viewModels/baselineAdapter";
import type { BaselineIntegrityViewModel } from "@/viewModels/types";

// ── Mocks ───────────────────────────────────────────────────────────────────
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

jest.mock("@/theme/themeTokens", () => ({
    colorWithAlpha: (hex: string, _alpha: number) => hex,
}));

// ── Adapter ─────────────────────────────────────────────────────────────────
describe("toBaselineIntegrityViewModel", () => {
    it("maps a populated DTO verbatim (no recomputation)", () => {
        const dto: BaselineDTO = {
            session_id: "sess-1",
            baseline_captured_at: "2026-07-31T08:00:00Z",
            baseline_source: "ERP snapshot",
            has_baseline: true,
        };
        const vm = toBaselineIntegrityViewModel(dto);

        expect(vm).toEqual({
            frozenAt: "2026-07-31T08:00:00Z",
            isImmutable: true,
            source: "ERP snapshot",
            sessionId: "sess-1",
        });
    });

    it("infers immutability from timestamp when has_baseline is absent", () => {
        const vm = toBaselineIntegrityViewModel({
            session_id: "sess-2",
            baseline_captured_at: "2026-07-31T09:00:00Z",
        });
        expect(vm.isImmutable).toBe(true);
        expect(vm.frozenAt).toBe("2026-07-31T09:00:00Z");
    });

    it("falls back to default source label when source is missing", () => {
        const vm = toBaselineIntegrityViewModel({ has_baseline: true });
        expect(vm.source).toBe("ERP snapshot");
        expect(vm.frozenAt).toBeUndefined();
    });

    it("treats empty strings as absence (never coerces to a value)", () => {
        const vm = toBaselineIntegrityViewModel({
            session_id: "",
            baseline_captured_at: "",
            baseline_source: "",
        });
        expect(vm.sessionId).toBeUndefined();
        expect(vm.frozenAt).toBeUndefined();
        expect(vm.source).toBe("ERP snapshot");
        expect(vm.isImmutable).toBe(false);
    });
});

// ── BaselineIntegrityBanner ─────────────────────────────────────────────────
describe("BaselineIntegrityBanner", () => {
    it("renders the frozen timestamp + immutability reassurance", () => {
        const vm: BaselineIntegrityViewModel = {
            frozenAt: "2026-07-31T08:00:00Z",
            isImmutable: true,
            source: "ERP snapshot",
            sessionId: "sess-1",
        };
        const { getByText } = render(<BaselineIntegrityBanner vm={vm} />);

        // Title contains "Baseline frozen"
        expect(getByText(/Baseline frozen/i)).toBeTruthy();
        // Body reassurance copy
        expect(getByText(/Immutable reference/i)).toBeTruthy();
        expect(getByText(/never recapture/i)).toBeTruthy();
    });

    it("shows the source label when present", () => {
        const { getByText } = render(
            <BaselineIntegrityBanner
                vm={{ isImmutable: true, source: "ERP snapshot", sessionId: "s" }}
            />,
        );
        expect(getByText(/ERP snapshot/i)).toBeTruthy();
    });

    it("falls back to 'at session start' when no timestamp", () => {
        const { getByText } = render(
            <BaselineIntegrityBanner vm={{ isImmutable: true, sessionId: "s" }} />,
        );
        expect(getByText(/at session start/i)).toBeTruthy();
    });
});

// ── StaleStateBadge ─────────────────────────────────────────────────────────
describe("StaleStateBadge", () => {
    it("renders a badge per known reason", () => {
        const { getByText } = render(
            <StaleStateBadge reasons={["cached_erp", "offline"]} />,
        );
        // textTransform: "uppercase" is a visual style; the text node holds the
        // original-case label from REASON_META.
        expect(getByText("Cached ERP")).toBeTruthy();
        expect(getByText("Offline")).toBeTruthy();
    });

    it("renders nothing when the reasons list is empty", () => {
        const { toJSON } = render(<StaleStateBadge reasons={[]} />);
        expect(toJSON()).toBeNull();
    });

    it("ignores unknown reasons defensively", () => {
        // Cast to bypass TS — simulates a forward-incompatible backend payload.
        const { queryByText } = render(
            <StaleStateBadge reasons={["cached_erp", "unknown_future_reason" as never]} />,
        );
        expect(queryByText("Cached ERP")).toBeTruthy();
        // Unknown reason simply does not render a badge.
        expect(queryByText("Unknown future reason")).toBeNull();
    });
});
