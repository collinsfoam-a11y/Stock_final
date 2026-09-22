import React from "react";
import { render } from "@testing-library/react-native";
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonListItem,
} from "../Skeleton";

describe("Skeleton Component Accessibility", () => {
  it("renders standalone Skeleton with default accessibility attributes", () => {
    const { getByRole, getByLabelText } = render(<Skeleton />);

    const skeleton = getByRole("progressbar");
    expect(skeleton).toBeTruthy();
    expect(skeleton.props.accessible).toBe(true);
    expect(getByLabelText("Loading...")).toBeTruthy();
  });

  it("supports custom accessibility label on standalone Skeleton", () => {
    const customLabel = "Loading user profile...";
    const { getByLabelText } = render(
      <Skeleton accessibilityLabel={customLabel} />
    );

    expect(getByLabelText(customLabel)).toBeTruthy();
  });

  it("renders non-shimmer fallback Skeleton with accessibility attributes", () => {
    const { getByRole } = render(<Skeleton shimmer={false} />);

    const skeleton = getByRole("progressbar");
    expect(skeleton).toBeTruthy();
    expect(skeleton.props.accessible).toBe(true);
  });

  it("allows setting accessible={false} on Skeleton when grouped inside parent containers", () => {
    const { queryByRole } = render(<Skeleton accessible={false} />);

    expect(queryByRole("progressbar")).toBeNull();
  });

  it("renders SkeletonText with container-level accessibility role and label", () => {
    const { getByRole, getByLabelText } = render(
      <SkeletonText accessibilityLabel="Loading text summary..." />
    );

    const container = getByRole("progressbar");
    expect(container).toBeTruthy();
    expect(getByLabelText("Loading text summary...")).toBeTruthy();
  });

  it("renders SkeletonCard with container-level accessibility role and label", () => {
    const { getByRole, getByLabelText } = render(
      <SkeletonCard accessibilityLabel="Loading card details..." />
    );

    const card = getByRole("progressbar");
    expect(card).toBeTruthy();
    expect(getByLabelText("Loading card details...")).toBeTruthy();
  });

  it("renders SkeletonListItem with container-level accessibility role and label", () => {
    const { getByRole, getByLabelText } = render(
      <SkeletonListItem accessibilityLabel="Loading item..." />
    );

    const listItem = getByRole("progressbar");
    expect(listItem).toBeTruthy();
    expect(getByLabelText("Loading item...")).toBeTruthy();
  });
});
