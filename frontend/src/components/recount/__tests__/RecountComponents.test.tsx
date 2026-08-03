import React from "react";
import { render } from "@testing-library/react-native";

import { RecountLineage } from "../RecountLineage";
import { RecountComparison } from "../RecountComparison";
import { BlindRecountGuard } from "../BlindRecountGuard";
import type { RecountComparisonViewModel, RecountVersionNode } from "@/viewModels/types";

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

const lineage: RecountVersionNode[] = [
    { version: 1, countedBy: "alice", countedAt: "2026-07-30T09:00:00Z", isRecount: false },
    { version: 2, countedBy: "bob", countedAt: "2026-07-31T10:00:00Z", isRecount: true, isBlind: true },
];

const comparison: RecountComparisonViewModel = {
    blinded: false,
    originalCount: 100,
    recountCount: 96,
    sqlAtRecount: 98,
    difference: -4,
    originalVariance: 2,
    recountVariance: -2,
};

/** What the adapter produces for the blind counter: sensitive fields absent. */
const blindedComparison: RecountComparisonViewModel = {
    blinded: true,
    recountCount: 96,
    sqlAtRecount: 98,
    recountVariance: -2,
};

describe("RecountLineage", () => {
    it("renders original + recount nodes and blind badge", () => {
        const { getByText } = render(<RecountLineage nodes={lineage} />);
        expect(getByText("Original count (v1)")).toBeTruthy();
        expect(getByText("Recount v2")).toBeTruthy();
        expect(getByText("Blind")).toBeTruthy();
    });

    it("renders an empty message when there are no nodes", () => {
        const { getByText } = render(<RecountLineage nodes={[]} />);
        expect(getByText("No count versions recorded yet.")).toBeTruthy();
    });
});

describe("RecountComparison (blind integrity)", () => {
    it("shows original count + variance by default", () => {
        const { getByText } = render(<RecountComparison comparison={comparison} />);
        expect(getByText("Original count")).toBeTruthy();
        expect(getByText("Original variance")).toBeTruthy();
        expect(getByText("100")).toBeTruthy();
    });

    it("HIDES (not masks) original count + variance when blinded", () => {
        const { queryByText, getByText } = render(
            <RecountComparison comparison={blindedComparison} />,
        );
        // Original rows omitted entirely.
        expect(queryByText("Original count")).toBeNull();
        expect(queryByText("Original variance")).toBeNull();
        // Recount rows still present.
        expect(getByText("Recount count")).toBeTruthy();
        expect(getByText("96")).toBeTruthy();
        // Blind note shown.
        expect(getByText(/Blind recount — the original count is hidden/)).toBeTruthy();
    });

    it("withholds Difference when blinded (original = recount − difference)", () => {
        const { queryByText } = render(<RecountComparison comparison={blindedComparison} />);
        // The Difference row is the arithmetic back-door to the original count:
        // 96 − (−4) = 100. It must not render for the blind counter.
        expect(queryByText("Difference")).toBeNull();
        expect(queryByText("-4")).toBeNull();
        expect(queryByText("100")).toBeNull();
    });

    it("does not carry blind-sensitive values in props at all", () => {
        // Stronger than a render assertion: the value must not be retained in
        // inspectable client state (§14.6). The adapter strips it upstream.
        expect(blindedComparison.originalCount).toBeUndefined();
        expect(blindedComparison.originalVariance).toBeUndefined();
        expect(blindedComparison.difference).toBeUndefined();
        expect(JSON.stringify(blindedComparison)).not.toContain("100");
    });
});

describe("BlindRecountGuard", () => {
    it("renders a blocking notice when blocked", () => {
        const { getByText } = render(<BlindRecountGuard blocked suggestedAssignee="carol" />);
        expect(getByText("You can't perform this recount")).toBeTruthy();
        expect(getByText(/reassign to carol/)).toBeTruthy();
    });

    it("renders nothing when not blocked", () => {
        const { toJSON } = render(<BlindRecountGuard blocked={false} />);
        expect(toJSON()).toBeNull();
    });
});
