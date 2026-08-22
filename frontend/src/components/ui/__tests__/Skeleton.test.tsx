import React from "react";
import { render } from "@testing-library/react-native";
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonListItem,
} from "../Skeleton";

describe("Skeleton Accessibility", () => {
  it("renders Skeleton with default accessibility attributes", () => {
    const { getByLabelText } = render(<Skeleton />);
    const skeleton = getByLabelText("Loading...");
    expect(skeleton).toBeTruthy();
    expect(skeleton.props.accessibilityRole).toBe("progressbar");
    expect(skeleton.props.accessible).toBe(true);
  });

  it("supports custom accessibilityLabel and accessible prop on Skeleton", () => {
    const { getByLabelText, queryByLabelText } = render(
      <Skeleton accessibilityLabel="Custom loading..." />
    );
    expect(getByLabelText("Custom loading...")).toBeTruthy();

    const { queryByLabelText: queryUnaccessible } = render(
      <Skeleton accessible={false} />
    );
    expect(queryUnaccessible("Loading...")).toBeNull();
  });

  it("renders SkeletonText with container accessibility", () => {
    const { getByLabelText } = render(<SkeletonText lines={2} />);
    const textSkeleton = getByLabelText("Loading content...");
    expect(textSkeleton).toBeTruthy();
    expect(textSkeleton.props.accessibilityRole).toBe("progressbar");
  });

  it("renders SkeletonCard with container accessibility", () => {
    const { getByLabelText } = render(<SkeletonCard />);
    const cardSkeleton = getByLabelText("Loading card...");
    expect(cardSkeleton).toBeTruthy();
    expect(cardSkeleton.props.accessibilityRole).toBe("progressbar");
  });

  it("renders SkeletonListItem with container accessibility", () => {
    const { getByLabelText } = render(<SkeletonListItem />);
    const itemSkeleton = getByLabelText("Loading item...");
    expect(itemSkeleton).toBeTruthy();
    expect(itemSkeleton.props.accessibilityRole).toBe("progressbar");
  });
});
