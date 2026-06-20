import React from "react";
import { render } from "@testing-library/react-native";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("renders correctly with name initials", () => {
    const { getByText } = render(<Avatar name="John Doe" />);
    expect(getByText("JD")).toBeTruthy();
  });

  it("applies correct accessibility properties", () => {
    const { getByLabelText } = render(<Avatar name="Jane Doe" />);
    const avatar = getByLabelText("Avatar for Jane Doe");
    expect(avatar.props.accessibilityRole).toBe("image");
  });

  it("uses custom accessibilityLabel when provided", () => {
    const { getByLabelText } = render(
      <Avatar name="Jane Doe" accessibilityLabel="Custom avatar label" />
    );
    expect(getByLabelText("Custom avatar label")).toBeTruthy();
  });

  it("renders badge and includes it in accessibility label", () => {
    const { getByLabelText } = render(<Avatar name="Jane Doe" badge={true} />);
    expect(getByLabelText("Avatar for Jane Doe, online")).toBeTruthy();
  });

  it("uses fallback label when name is not provided", () => {
    const { getByLabelText } = render(<Avatar />);
    expect(getByLabelText("User avatar")).toBeTruthy();
  });
});
