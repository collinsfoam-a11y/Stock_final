import React from "react";
import { render } from "@testing-library/react-native";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("renders initials correctly when name is provided", () => {
    const { getByText } = render(<Avatar name="John Doe" />);
    expect(getByText("JD")).toBeTruthy();
  });

  it("has correct accessibility attributes for image role", () => {
    const { getByLabelText } = render(<Avatar name="Jane Smith" />);
    const avatar = getByLabelText("Jane Smith");

    expect(avatar.props.accessible).toBe(true);
    expect(avatar.props.accessibilityRole).toBe("image");
  });

  it("includes active status in accessibilityLabel when badge is present", () => {
    const { getByLabelText } = render(<Avatar name="Jane Smith" badge={true} />);
    expect(getByLabelText("Jane Smith, active status")).toBeTruthy();
  });

  it("uses default label when name is not provided", () => {
    const { getByLabelText } = render(<Avatar />);
    expect(getByLabelText("Avatar")).toBeTruthy();
  });

  it("uses default label with status when name is missing but badge is present", () => {
    const { getByLabelText } = render(<Avatar badge={true} />);
    expect(getByLabelText("Avatar, active status")).toBeTruthy();
  });
});
