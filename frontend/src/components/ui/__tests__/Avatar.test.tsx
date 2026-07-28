import React from "react";
import { render } from "@testing-library/react-native";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("renders correctly with name and has correct accessibility attributes", () => {
    const { getByLabelText, getByText } = render(<Avatar name="John Doe" />);

    expect(getByText("JD")).toBeTruthy();
    const avatar = getByLabelText("Avatar for John Doe");
    expect(avatar.props.accessibilityRole).toBe("image");
    expect(avatar.props.accessible).toBe(true);
  });

  it("renders correctly without name and has default accessibility label", () => {
    const { getByLabelText } = render(<Avatar />);

    const avatar = getByLabelText("User avatar");
    expect(avatar.props.accessibilityRole).toBe("image");
    expect(avatar.props.accessible).toBe(true);
  });

  it("renders with image source", () => {
    const { getByLabelText } = render(
      <Avatar source={{ uri: "https://example.com/avatar.jpg" }} name="Jane Doe" />
    );

    const avatar = getByLabelText("Avatar for Jane Doe");
    expect(avatar).toBeTruthy();
  });

  it("hides decorative icon from accessibility tree", () => {
    const { getByLabelText } = render(<Avatar />);
    const avatar = getByLabelText("User avatar");

    // Find the icon within the avatar container.
    // The structure is Container -> AvatarView -> renderContent (Ionicons)
    // We use a safer way to access the deep child
    const avatarView = avatar.props.children[0];
    const icon = avatarView.props.children;

    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no");
  });
});
