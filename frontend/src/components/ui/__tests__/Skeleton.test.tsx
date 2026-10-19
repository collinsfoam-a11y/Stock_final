import React from "react";
import { render } from "@testing-library/react-native";
import { Skeleton, SkeletonText, SkeletonCard, SkeletonListItem } from "../Skeleton";
import { SkeletonList } from "../SkeletonList";

describe("Skeleton Accessibility", () => {
  it("renders Skeleton with correct accessibility properties in shimmer mode", () => {
    const { getByLabelText } = render(<Skeleton shimmer={true} />);
    const el = getByLabelText("Loading...");

    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("progressbar");
    expect(el.props.accessibilityValue).toEqual({ text: "Loading" });
  });

  it("renders Skeleton with correct accessibility properties in non-shimmer mode", () => {
    const { getByLabelText } = render(<Skeleton shimmer={false} accessibilityLabel="Loading image..." />);
    const el = getByLabelText("Loading image...");

    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("progressbar");
    expect(el.props.accessibilityValue).toEqual({ text: "Loading" });
  });

  it("renders SkeletonText with correct accessibility properties", () => {
    const { getByLabelText } = render(<SkeletonText accessibilityLabel="Loading description..." />);
    const el = getByLabelText("Loading description...");

    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("progressbar");
  });

  it("renders SkeletonCard with correct accessibility properties", () => {
    const { getByLabelText } = render(<SkeletonCard accessibilityLabel="Loading user profile card..." />);
    const el = getByLabelText("Loading user profile card...");

    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("progressbar");
  });

  it("renders SkeletonListItem with correct accessibility properties", () => {
    const { getByLabelText } = render(<SkeletonListItem accessibilityLabel="Loading inventory row..." />);
    const el = getByLabelText("Loading inventory row...");

    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("progressbar");
  });

  it("renders SkeletonList with correct accessibility properties", () => {
    const { getByLabelText } = render(<SkeletonList accessibilityLabel="Loading products list..." />);
    const el = getByLabelText("Loading products list...");

    expect(el.props.accessible).toBe(true);
    expect(el.props.accessibilityRole).toBe("progressbar");
  });
});
