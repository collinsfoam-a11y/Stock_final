import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { ExceptionCard } from "../ExceptionCard";
import { FinalizationGateChecklist } from "../FinalizationGateChecklist";
import type { ExceptionViewModel, FinalizationGateViewModel } from "@/viewModels/types";

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

// ModernButton (used by FinalizationGateChecklist) dependencies
jest.mock("@/context/ThemeContext", () => ({
    useThemeContextSafe: () => null,
}));
jest.mock("@/services/haptics", () => ({
    haptics: { light: jest.fn() },
}));

// ── Fixtures ────────────────────────────────────────────────────────────────
const blockingException: ExceptionViewModel = {
    code: "DUPLICATE_IDENTITY_SUBMITTED",
    severity: "blocking",
    title: "Already counted here",
    description: "This item was already counted in Floor F1 / Rack R2.",
    entityId: "obs-123",
    action: { label: "View existing count", journey: "OPEN_EXISTING_COUNT" },
};

const blockedGate: FinalizationGateViewModel = {
    allowed: false,
    assessmentToken: "tok-abc",
    assessedAt: "2026-07-31T10:00:00Z",
    blockers: [
        { code: "UNRESOLVED_RECOUNT", severity: "blocking", description: "1 recount request is pending." },
        { code: "UNKNOWN_ITEMS", severity: "blocking", description: "2 unknown barcodes must be resolved." },
    ],
};

const readyGate: FinalizationGateViewModel = {
    allowed: true,
    assessmentToken: "tok-xyz",
    assessedAt: "2026-07-31T10:05:00Z",
    blockers: [],
};

// ── ExceptionCard ───────────────────────────────────────────────────────────
describe("ExceptionCard", () => {
    it("renders title + description", () => {
        const { getByText } = render(<ExceptionCard vm={blockingException} />);
        expect(getByText("Already counted here")).toBeTruthy();
        expect(getByText("This item was already counted in Floor F1 / Rack R2.")).toBeTruthy();
    });

    it("renders the action button and fires onAction with the full VM", () => {
        const onAction = jest.fn();
        const { getByText } = render(<ExceptionCard vm={blockingException} onAction={onAction} />);
        fireEvent.press(getByText("View existing count"));
        expect(onAction).toHaveBeenCalledWith(blockingException);
    });

    it("does not render an action button when none is provided", () => {
        const noAction = { ...blockingException, action: undefined };
        const { queryByText } = render(<ExceptionCard vm={noAction} />);
        expect(queryByText("View existing count")).toBeNull();
    });
});

// ── FinalizationGateChecklist ───────────────────────────────────────────────
describe("FinalizationGateChecklist", () => {
    it("lists blockers and disables finalise when not allowed", () => {
        const onFinalize = jest.fn();
        const { getByText, getByLabelText } = render(
            <FinalizationGateChecklist vm={blockedGate} onFinalize={onFinalize} />,
        );
        expect(getByText("2 blockers to resolve")).toBeTruthy();
        expect(getByText("UNRESOLVED_RECOUNT")).toBeTruthy();
        expect(getByText("UNKNOWN_ITEMS")).toBeTruthy();
        // Button is disabled — pressing must not call onFinalize.
        const btn = getByLabelText("Finalise session is disabled until all blockers are resolved");
        expect(btn.props.accessibilityState?.disabled).toBe(true);
    });

    it("shows ready state and enables finalise when allowed", () => {
        const onFinalize = jest.fn();
        const { getByLabelText } = render(
            <FinalizationGateChecklist vm={readyGate} onFinalize={onFinalize} />,
        );
        const btn = getByLabelText("Finalise session");
        expect(btn.props.accessibilityState?.disabled).toBeFalsy();
        fireEvent.press(btn);
        expect(onFinalize).toHaveBeenCalledWith("tok-xyz");
    });
});
