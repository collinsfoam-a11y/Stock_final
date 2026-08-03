import React from "react";
import { Text, View } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";

import { OperationalShell } from "../OperationalShell";

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
        shadows: { none: {}, sm: {}, md: {}, lg: {}, xl: {} },
        motion: { enabled: true, fast: 120, normal: 240, slow: 360 },
    }),
}));

jest.mock("@/theme/themeTokens", () => ({
    colorWithAlpha: (hex: string, _alpha: number) => hex,
    getTokenShadowStyle: () => ({}),
}));

jest.mock("react-native-safe-area-context", () => {
    const React = require("react");
    const { View } = require("react-native");
    return {
        SafeAreaView: ({ children, style }: any) =>
            React.createElement(View, { style }, children),
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    };
});

// ModernButton → simple pressable to avoid reanimated/haptics in unit tests.
jest.mock("@/components/ui/ModernButton", () => {
    const React = require("react");
    const { Text, Pressable } = require("react-native");
    return {
        ModernButton: ({ title, onPress, testID, disabled }: any) =>
            React.createElement(
                Pressable,
                { onPress, disabled, testID, accessibilityRole: "button" },
                React.createElement(Text, null, title),
            ),
    };
});

// ── Tests ───────────────────────────────────────────────────────────────────
describe("OperationalShell", () => {
    const baseProps = {
        contextLabel: "Floor 1 • Rack A12",
        contextSublabel: "Session #42",
        primaryAction: { label: "Finish Rack", onPress: jest.fn(), testID: "primary-cta" },
        children: React.createElement(Text, null, "Scan workspace content"),
    };

    it("renders the fixed context header label and sublabel", () => {
        const { getByText } = render(React.createElement(OperationalShell, baseProps as any));
        expect(getByText("Floor 1 • Rack A12")).toBeTruthy();
        expect(getByText("Session #42")).toBeTruthy();
    });

    it("renders the primary CTA in the sticky action bar", () => {
        const { getByText } = render(React.createElement(OperationalShell, baseProps as any));
        expect(getByText("Finish Rack")).toBeTruthy();
    });

    it("fires the primary action on press", () => {
        const onPress = jest.fn();
        const { getByTestId } = render(
            React.createElement(
                OperationalShell,
                { ...baseProps, primaryAction: { label: "Finish Rack", onPress, testID: "cta" } } as any,
            ),
        );
        fireEvent(getByTestId("cta"), "press");
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("renders children content inside the scroll area", () => {
        const { getByText } = render(React.createElement(OperationalShell, baseProps as any));
        expect(getByText("Scan workspace content")).toBeTruthy();
    });

    it("renders the header-right node when provided", () => {
        const { getByTestId } = render(
            React.createElement(
                OperationalShell,
                {
                    ...baseProps,
                    headerRight: React.createElement(View, { testID: "sync-pill" }),
                } as any,
            ),
        );
        expect(getByTestId("sync-pill")).toBeTruthy();
    });
});
