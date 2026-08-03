import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { KpiTile } from "../KpiTile";
import { ExceptionTriageList } from "../ExceptionTriageList";
import {
    toDashboardKpiViewModel,
    toExceptionTriageItem,
    formatCompact,
    formatKpiValue,
    type KpiMetricDTO,
} from "@/viewModels/dashboardAdapter";
import { buildSupervisorTriage } from "@/viewModels/supervisorTriageAdapter";
import type {
    DashboardKpiViewModel,
    ExceptionTriageItem,
} from "@/viewModels/types";

// ── Mocks ───────────────────────────────────────────────────────────────────
jest.mock("@/hooks/useUiTokens", () => ({
    useUiTokens: () => ({
        mode: "light",
        colors: {
            accent: "#2563eb",
            accentStrong: "#1d4ed8",
            error: "#dc2626",
            warning: "#d97706",
            success: "#16a34a",
            info: "#0ea5e9",
            textPrimary: "#0f172a",
            textSecondary: "#475569",
            textMuted: "#94a3b8",
            surface: "#ffffff",
            border: "#e2e8f0",
            background: "#f8fafc",
        },
        spacing: { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
        radius: { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
        motion: { enabled: true, fast: 150, normal: 200, slow: 300 },
    }),
}));

// No entering animation in tests (avoids reanimated worklet execution).
jest.mock("@/hooks/useMotionAwareEntering", () => ({
    useMotionAwareEntering: () => undefined,
}));

jest.mock("@/theme/themeTokens", () => ({
    colorWithAlpha: (hex: string, _alpha: number) => hex,
}));

// AppTouchable → simple pressable for deterministic press testing.
jest.mock("@/components/ui/AppTouchable", () => {
    const React = require("react");
    const { Pressable } = require("react-native");
    return {
        AppTouchable: ({ children, onPress, accessibilityLabel, testID }: any) =>
            React.createElement(
                Pressable,
                { onPress, accessibilityLabel, testID },
                children,
            ),
    };
});

// ── Adapter: formatting ─────────────────────────────────────────────────────
describe("dashboardAdapter formatting", () => {
    it("compacts large numbers (INR L/K notation)", () => {
        // 1 lakh = 1,00,000 = 100,000; 15,00,000 = 15 lakh.
        expect(formatCompact(1500000)).toBe("15.0L");
        expect(formatCompact(120000)).toBe("1.2L");
        expect(formatCompact(2500)).toBe("2.5K");
        expect(formatCompact(42)).toBe("42");
    });

    it("formats currency with the rupee prefix", () => {
        expect(formatKpiValue(120000, "currency")).toBe("₹1.2L");
    });

    it("formats percent with no decimals", () => {
        expect(formatKpiValue(94, "percent")).toBe("94%");
    });

    it("renders an em-dash for absent values (never zero)", () => {
        expect(formatKpiValue(null, "currency")).toBe("—");
        expect(formatKpiValue(undefined as any, "count")).toBe("—");
    });
});

// ── Adapter: toDashboardKpiViewModel ────────────────────────────────────────
describe("toDashboardKpiViewModel", () => {
    it("maps a populated metric with trend inference", () => {
        const dto: KpiMetricDTO = {
            kind: "verified_value",
            value: 120000,
            label: "Verified Value",
            unit: "currency",
            priorValue: 100000,
        };
        const vm = toDashboardKpiViewModel(dto);
        expect(vm.displayValue).toBe("₹1.2L");
        expect(vm.isAbsent).toBe(false);
        expect(vm.trend).toEqual({ delta: 20000, direction: "up" });
    });

    it("marks absence and omits trend when value is null", () => {
        const vm = toDashboardKpiViewModel({
            kind: "projection_health",
            value: null,
            label: "Projection Health",
            unit: "percent",
        });
        expect(vm.isAbsent).toBe(true);
        expect(vm.displayValue).toBe("—");
        expect(vm.trend).toBeUndefined();
    });

    it("infers a downward trend", () => {
        const vm = toDashboardKpiViewModel({
            kind: "shortage_value",
            value: 50,
            label: "Shortage",
            priorValue: 80,
        });
        expect(vm.trend?.direction).toBe("down");
        expect(vm.trend?.delta).toBe(-30);
    });
});

// ── Adapter: toExceptionTriageItem ──────────────────────────────────────────
describe("toExceptionTriageItem", () => {
    it("fills defaults from the kind", () => {
        const item = toExceptionTriageItem({ kind: "failed_sync", count: 3 });
        expect(item.title).toBe("Failed syncs");
        expect(item.severity).toBe("critical");
        expect(item.count).toBe(3);
    });

    it("floors and clamps the count to a non-negative integer", () => {
        const item = toExceptionTriageItem({ kind: "stuck_session", count: -2.7 });
        expect(item.count).toBe(0);
    });

    it("honours explicit overrides", () => {
        const item = toExceptionTriageItem({
            kind: "high_variance",
            count: 5,
            title: "Custom",
            severity: "medium",
        });
        expect(item.title).toBe("Custom");
        expect(item.severity).toBe("medium");
    });
});

// ── KpiTile ─────────────────────────────────────────────────────────────────
describe("KpiTile", () => {
    const vm: DashboardKpiViewModel = {
        kind: "verified_value",
        displayValue: "₹1.2L",
        label: "Verified Value",
        status: "success",
    };

    it("renders the big value and label", () => {
        const { getByText } = render(<KpiTile vm={vm} />);
        expect(getByText("₹1.2L")).toBeTruthy();
        expect(getByText("Verified Value")).toBeTruthy();
    });

    it("fires onPress when tapped", () => {
        const onPress = jest.fn();
        const { getByLabelText } = render(<KpiTile vm={vm} onPress={onPress} />);
        fireEvent(getByLabelText(/Verified Value/), "press");
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("renders an em-dash value for absent metrics", () => {
        const { getByText } = render(<KpiTile vm={{ ...vm, displayValue: "—", isAbsent: true }} />);
        expect(getByText("—")).toBeTruthy();
    });
});

// ── ExceptionTriageList ─────────────────────────────────────────────────────
describe("ExceptionTriageList", () => {
    const items: ExceptionTriageItem[] = [
        { kind: "overdue_recount", title: "Overdue recounts", description: "d", count: 2, severity: "medium" },
        { kind: "failed_sync", title: "Failed syncs", description: "d", count: 3, severity: "critical" },
        { kind: "high_variance", title: "High variance", description: "d", count: 1, severity: "high" },
    ];

    it("renders nothing for an empty list", () => {
        const { toJSON } = render(<ExceptionTriageList items={[]} />);
        expect(toJSON()).toBeNull();
    });

    it("renders each item title", () => {
        const { getByText } = render(<ExceptionTriageList items={items} />);
        expect(getByText("Failed syncs")).toBeTruthy();
        expect(getByText("High variance")).toBeTruthy();
        expect(getByText("Overdue recounts")).toBeTruthy();
    });

    it("fires onPressItem with the tapped item", () => {
        const onPressItem = jest.fn();
        const { getByLabelText } = render(
            <ExceptionTriageList items={items} onPressItem={onPressItem} />,
        );
        fireEvent(getByLabelText(/Failed syncs/), "press");
        expect(onPressItem).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "failed_sync" }),
        );
    });
});

// ── buildSupervisorTriage ───────────────────────────────────────────────────
describe("buildSupervisorTriage", () => {
    it("returns high_variance when highRiskSessions > 0", () => {
        const items = buildSupervisorTriage({ highRiskSessions: 3, openSessions: 5 });
        expect(items).toHaveLength(1);
        const first = items[0]!;
        expect(first.kind).toBe("high_variance");
        expect(first.count).toBe(3);
        expect(first.linkTo?.route).toBe("/supervisor/variances");
    });

    it("omits zero-count items (renders nothing when clean)", () => {
        const items = buildSupervisorTriage({ highRiskSessions: 0, openSessions: 0 });
        expect(items).toHaveLength(0);
    });

    it("includes optional counts when provided", () => {
        const items = buildSupervisorTriage({
            highRiskSessions: 2,
            openSessions: 1,
            failedSyncCount: 4,
            overdueRecountCount: 1,
        });
        const kinds = items.map((i) => i.kind);
        expect(kinds).toContain("failed_sync");
        expect(kinds).toContain("high_variance");
        expect(kinds).toContain("overdue_recount");
    });
});
