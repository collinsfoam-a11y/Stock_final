import React from "react";
import { render } from "@testing-library/react-native";

import { OperationalStatusStrip } from "../OperationalStatusStrip";

describe("OperationalStatusStrip", () => {
  it("renders compact operational telemetry", () => {
    const { getAllByText, getByLabelText, getByText } = render(
      <OperationalStatusStrip
        offline={false}
        syncState="Ready"
        pendingQueueCount={2}
        scannerReady
        activeRecounts={1}
        uploadBacklog={0}
        runtimeHealth="Stable"
        items={[{ label: "Conflicts", value: 3, tone: "warning", icon: "warning-outline" }]}
      />
    );

    expect(getByLabelText(/Network Online/)).toBeTruthy();
    expect(getByText("Network")).toBeTruthy();
    expect(getByText("Scanner")).toBeTruthy();
    expect(getAllByText("Ready").length).toBeGreaterThan(0);
    expect(getByText("Conflicts")).toBeTruthy();
  });

  it("does not render when no telemetry is provided", () => {
    const { toJSON } = render(<OperationalStatusStrip />);

    expect(toJSON()).toBeNull();
  });
});
