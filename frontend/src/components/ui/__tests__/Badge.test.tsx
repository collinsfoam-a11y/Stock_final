import React from "react";
import { render } from "@testing-library/react-native";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders correctly with label", () => {
    const { getByText } = render(<Badge label="New" />);
    expect(getByText("New")).toBeTruthy();
  });

  it("has accessibility properties", () => {
    const { getByLabelText, getAllByRole } = render(
      <Badge label="Count: 5" />
    );
    expect(getByLabelText("Badge: Count: 5")).toBeTruthy();
    expect(getAllByRole("text").length).toBeGreaterThan(0);
  });

  it("renders as a dot when dot prop is true", () => {
    const { queryByText } = render(<Badge label="1" dot />);
    expect(queryByText("1")).toBeNull();
  });
});
