import React from "react";
import { render, act, renderHook } from "@testing-library/react-native";

import { useScanAcknowledge } from "../useScanAcknowledge";
import { ScanAcknowledgeOverlay } from "../ScanAcknowledgeOverlay";
import { ScanSearchResultsList } from "../ScanSearchResultsList";

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
        motion: { enabled: true, fast: 120, normal: 240, slow: 360 },
    }),
}));

jest.mock("@/hooks/useReducedMotion", () => ({
    useReducedMotion: () => true, // deterministic: no animation timing in tests
}));

jest.mock("@/theme/themeTokens", () => ({
    colorWithAlpha: (hex: string, _alpha: number) => hex,
}));

jest.mock("@/theme/unified", () => ({
    colors: { primary: { 50: "#eff6ff", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" } },
}));

// FlashList → simple inline renderer so items are queryable in jest.
jest.mock("@shopify/flash-list", () => {
    const React = require("react");
    const { View } = require("react-native");
    const FlashList = ({ data, renderItem, ListFooterComponent }: any) =>
        React.createElement(
            View,
            { testID: "flash-list" },
            data.map((item: any, index: number) =>
                React.createElement(View, { key: index }, renderItem({ item, index })),
            ),
            ListFooterComponent ? React.createElement(ListFooterComponent) : null,
        );
    return { FlashList };
});

// ── useScanAcknowledge ──────────────────────────────────────────────────────
describe("useScanAcknowledge", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("starts idle with an empty message", () => {
        const { result } = renderHook(() => useScanAcknowledge());
        expect(result.current.state).toBe("idle");
        expect(result.current.message).toBe("");
    });

    it("flips to success with the default message synchronously", () => {
        const { result } = renderHook(() => useScanAcknowledge());
        act(() => result.current.acknowledge("success"));
        expect(result.current.state).toBe("success");
        expect(result.current.message).toBe("Saved");
    });

    it("accepts a custom message", () => {
        const { result } = renderHook(() => useScanAcknowledge());
        act(() => result.current.acknowledge("error", "Barcode not found"));
        expect(result.current.state).toBe("error");
        expect(result.current.message).toBe("Barcode not found");
    });

    it("uses the duplicate default label", () => {
        const { result } = renderHook(() => useScanAcknowledge());
        act(() => result.current.acknowledge("duplicate"));
        expect(result.current.message).toBe("Already counted");
    });

    it("auto-clears back to idle after the duration", () => {
        const { result } = renderHook(() => useScanAcknowledge(900));
        act(() => result.current.acknowledge("success"));
        expect(result.current.state).toBe("success");
        act(() => jest.advanceTimersByTime(900));
        expect(result.current.state).toBe("idle");
    });

    it("clear() resets to idle immediately", () => {
        const { result } = renderHook(() => useScanAcknowledge());
        act(() => result.current.acknowledge("error"));
        act(() => result.current.clear());
        expect(result.current.state).toBe("idle");
    });
});

// ── ScanAcknowledgeOverlay ──────────────────────────────────────────────────
describe("ScanAcknowledgeOverlay", () => {
    it("renders nothing when idle", () => {
        const { toJSON } = render(<ScanAcknowledgeOverlay state="idle" />);
        expect(toJSON()).toBeNull();
    });

    it("renders an alert with the success label", () => {
        const { getByLabelText } = render(<ScanAcknowledgeOverlay state="success" />);
        expect(getByLabelText("Saved")).toBeTruthy();
    });

    it("renders the duplicate label", () => {
        const { getByLabelText } = render(<ScanAcknowledgeOverlay state="duplicate" />);
        expect(getByLabelText("Already counted")).toBeTruthy();
    });

    it("prefers a provided message over the default", () => {
        const { getByLabelText } = render(
            <ScanAcknowledgeOverlay state="error" message="Network failed" />,
        );
        expect(getByLabelText("Network failed")).toBeTruthy();
    });
});

// ── ScanSearchResultsList ───────────────────────────────────────────────────
describe("ScanSearchResultsList", () => {
    const sampleItems = [
        { item_code: "A1", item_name: "Apple", _id: "1" },
        { item_code: "B2", item_name: "Banana", _id: "2" },
    ];

    it("renders each item name", () => {
        const { getByText } = render(
            <ScanSearchResultsList data={sampleItems} onPressItem={jest.fn()} />,
        );
        expect(getByText("Apple")).toBeTruthy();
        expect(getByText("Banana")).toBeTruthy();
    });

    it("renders nothing for an empty data set", () => {
        const { toJSON } = render(<ScanSearchResultsList data={[]} onPressItem={jest.fn()} />);
        expect(toJSON()).toBeNull();
    });

    it("shows the load-more affordance when hasMore is true", () => {
        const { getByText } = render(
            <ScanSearchResultsList
                data={sampleItems}
                onPressItem={jest.fn()}
                hasMore
                onLoadMore={jest.fn()}
            />,
        );
        expect(getByText("Load More Results...")).toBeTruthy();
    });
});
