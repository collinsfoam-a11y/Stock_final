import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { FinishRackModal } from "@/components/scan/FinishRackModal";

// Mock ThemeContext to avoid importing heavy store dependencies
jest.mock("@/context/ThemeContext", () => ({
  useThemeContextSafe: () => null,
}));

describe("FinishRackModal", () => {
  const defaultStats = {
    scannedItems: 12,
    verifiedItems: 10,
    pendingItems: 2,
  };

  it("renders title with header accessibility role and correct location text", () => {
    const { getByText } = render(
      <FinishRackModal
        visible={true}
        isFinishing={false}
        currentFloor="Ground Floor"
        currentRack="Rack A"
        sessionStats={defaultStats}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />
    );

    const titleElement = getByText("Complete Rack Scan?");
    expect(titleElement.props.accessibilityRole).toBe("header");
    expect(getByText(/Ground Floor/)).toBeTruthy();
    expect(getByText(/Rack A/)).toBeTruthy();
  });

  it("renders scan summary with accessible grouping label", () => {
    const { getByLabelText } = render(
      <FinishRackModal
        visible={true}
        isFinishing={false}
        currentFloor="Ground Floor"
        currentRack="Rack A"
        sessionStats={defaultStats}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />
    );

    const summaryElement = getByLabelText(
      "Scan summary: 12 items scanned, 10 verified, 2 pending review"
    );
    expect(summaryElement).toBeTruthy();
  });

  it("triggers onClose when 'Keep Scanning' button is pressed", () => {
    const onCloseMock = jest.fn();
    const { getByText } = render(
      <FinishRackModal
        visible={true}
        isFinishing={false}
        currentFloor="Ground Floor"
        currentRack="Rack A"
        sessionStats={defaultStats}
        onClose={onCloseMock}
        onConfirm={jest.fn()}
      />
    );

    const keepScanningBtn = getByText("Keep Scanning");
    fireEvent.press(keepScanningBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it("triggers onConfirm when 'Complete' button is pressed", () => {
    const onConfirmMock = jest.fn();
    const { getByText } = render(
      <FinishRackModal
        visible={true}
        isFinishing={false}
        currentFloor="Ground Floor"
        currentRack="Rack A"
        sessionStats={defaultStats}
        onClose={jest.fn()}
        onConfirm={onConfirmMock}
      />
    );

    const completeBtn = getByText("Complete");
    fireEvent.press(completeBtn);
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });
});
