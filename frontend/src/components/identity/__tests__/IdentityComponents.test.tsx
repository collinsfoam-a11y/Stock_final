import React from "react";
import { render } from "@testing-library/react-native";

import { InventoryIdentityBadge } from "../InventoryIdentityBadge";
import { MultiLocationDistribution } from "../MultiLocationDistribution";
import {
    toInventoryIdentityViewModel,
    toMultiLocationDistributionViewModel,
} from "@/viewModels/identityAdapter";
import type { InventoryIdentityViewModel, MultiLocationDistributionViewModel } from "@/viewModels/types";

jest.mock("@/hooks/useUiTokens", () => ({
    useUiTokens: () => ({
        mode: "light",
        colors: {
            accent: "#2563eb",
            error: "#dc2626",
            warning: "#d97706",
            success: "#16a34a",
            info: "#0ea5e9",
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
describe("identityAdapter", () => {
    it("maps a single identity DTO, preserving the backend already_counted verdict", () => {
        const vm = toInventoryIdentityViewModel({
            item_code: "ITEM-9",
            item_name: "Bolt M8",
            batch_no: "B42",
            floor: "F2",
            rack: "R5",
            identity_key: "ITEM-9|B42|F2|R5",
            already_counted: true,
            existing_count_id: "obs-9",
        });
        expect(vm.itemCode).toBe("ITEM-9");
        expect(vm.batchNo).toBe("B42");
        expect(vm.location.floor).toBe("F2");
        expect(vm.alreadyCounted).toBe(true);
        expect(vm.existingCountId).toBe("obs-9");
    });

    it("maps a multi-location distribution, preserving every location", () => {
        const vm = toMultiLocationDistributionViewModel({
            item_code: "ITEM-9",
            item_name: "Bolt M8",
            locations: [
                { floor: "F1", rack: "R1", identity_key: "k1", already_counted: true, counted_qty: 50 },
                { floor: "F2", rack: "R5", identity_key: "k2", already_counted: false },
            ],
        });
        expect(vm.totalLocations).toBe(2);
        expect(vm.locations[0]!.alreadyCounted).toBe(true);
        expect(vm.locations[0]!.countedQty).toBe(50);
        expect(vm.locations[1]!.alreadyCounted).toBe(false);
        expect(vm.locations[1]!.countedQty).toBeNull();
    });
});

// ── InventoryIdentityBadge ──────────────────────────────────────────────────
const countedIdentity: InventoryIdentityViewModel = {
    itemCode: "ITEM-9",
    itemName: "Bolt M8",
    batchNo: "B42",
    serialNo: null,
    location: { floor: "F2", rack: "R5" },
    identityKey: "ITEM-9|B42|F2|R5",
    alreadyCounted: true,
    existingCountId: "obs-9",
};

describe("InventoryIdentityBadge", () => {
    it("renders the identity tuple + counted-here verdict", () => {
        const { getByText } = render(<InventoryIdentityBadge vm={countedIdentity} />);
        expect(getByText("Bolt M8")).toBeTruthy();
        expect(getByText("Batch B42")).toBeTruthy();
        expect(getByText("Floor F2 · Rack R5")).toBeTruthy();
        expect(getByText("Counted here")).toBeTruthy();
    });

    it("does not show the counted verdict when not already counted", () => {
        const fresh = { ...countedIdentity, alreadyCounted: false };
        const { queryByText } = render(<InventoryIdentityBadge vm={fresh} />);
        expect(queryByText("Counted here")).toBeNull();
    });
});

// ── MultiLocationDistribution ───────────────────────────────────────────────
const distribution: MultiLocationDistributionViewModel = {
    itemCode: "ITEM-9",
    itemName: "Bolt M8",
    totalLocations: 2,
    locations: [
        { location: { floor: "F1", rack: "R1" }, identityKey: "k1", alreadyCounted: true, countedQty: 50 },
        { location: { floor: "F2", rack: "R5" }, identityKey: "k2", alreadyCounted: false, countedQty: null },
    ],
};

describe("MultiLocationDistribution", () => {
    it("frames multi-location as distribution, not duplicate", () => {
        const { getByText } = render(<MultiLocationDistribution vm={distribution} />);
        expect(getByText(/normal distribution, not a duplicate/)).toBeTruthy();
        expect(getByText("1/2 counted")).toBeTruthy();
    });

    it("lists each location with its count status", () => {
        const { getByText } = render(<MultiLocationDistribution vm={distribution} />);
        expect(getByText("Floor F1 · Rack R1")).toBeTruthy();
        expect(getByText(/Counted · 50 units/)).toBeTruthy();
        expect(getByText("Floor F2 · Rack R5")).toBeTruthy();
        expect(getByText("Awaiting count")).toBeTruthy();
    });
});
