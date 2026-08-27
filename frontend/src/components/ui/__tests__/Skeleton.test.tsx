import React from "react";
import { render } from "@testing-library/react-native";
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonListItem,
} from "../Skeleton";

describe("Skeleton components", () => {
  describe("Skeleton", () => {
    it("renders with default accessibility props (shimmer mode)", () => {
      const { getByLabelText } = render(<Skeleton shimmer={true} />);
      const element = getByLabelText("Loading...");
      expect(element).toBeTruthy();
      expect(element.props.accessibilityRole).toBe("progressbar");
    });

    it("renders with default accessibility props (pulse mode)", () => {
      const { getByLabelText } = render(<Skeleton shimmer={false} />);
      const element = getByLabelText("Loading...");
      expect(element).toBeTruthy();
      expect(element.props.accessibilityRole).toBe("progressbar");
    });

    it("accepts custom accessibilityLabel", () => {
      const { getByLabelText } = render(
        <Skeleton accessibilityLabel="Loading profile picture" />
      );
      const element = getByLabelText("Loading profile picture");
      expect(element).toBeTruthy();
      expect(element.props.accessibilityRole).toBe("progressbar");
    });

    it("respects accessible=false", () => {
      const { queryByLabelText } = render(
        <Skeleton accessible={false} accessibilityLabel="Hidden" />
      );
      expect(queryByLabelText("Hidden")).toBeNull();
    });
  });

  describe("SkeletonText", () => {
    it("renders with default accessibility props and disables inner skeleton accessibility", () => {
      const { getByLabelText, queryAllByLabelText } = render(
        <SkeletonText lines={3} />
      );
      const rootElement = getByLabelText("Loading text...");
      expect(rootElement).toBeTruthy();
      expect(rootElement.props.accessibilityRole).toBe("progressbar");
      expect(queryAllByLabelText("Loading...").length).toBe(0);
    });

    it("accepts custom accessibilityLabel", () => {
      const { getByLabelText } = render(
        <SkeletonText accessibilityLabel="Loading description..." />
      );
      expect(getByLabelText("Loading description...")).toBeTruthy();
    });
  });

  describe("SkeletonCard", () => {
    it("renders card skeleton with container accessibility props", () => {
      const { getByLabelText, queryAllByLabelText } = render(<SkeletonCard />);
      const rootElement = getByLabelText("Loading card...");
      expect(rootElement).toBeTruthy();
      expect(rootElement.props.accessibilityRole).toBe("progressbar");
      expect(queryAllByLabelText("Loading...").length).toBe(0);
      expect(queryAllByLabelText("Loading text...").length).toBe(0);
    });

    it("accepts custom accessibilityLabel", () => {
      const { getByLabelText } = render(
        <SkeletonCard accessibilityLabel="Loading user summary card" />
      );
      expect(getByLabelText("Loading user summary card")).toBeTruthy();
    });
  });

  describe("SkeletonListItem", () => {
    it("renders list item skeleton with container accessibility props", () => {
      const { getByLabelText, queryAllByLabelText } = render(
        <SkeletonListItem />
      );
      const rootElement = getByLabelText("Loading list item...");
      expect(rootElement).toBeTruthy();
      expect(rootElement.props.accessibilityRole).toBe("progressbar");
      expect(queryAllByLabelText("Loading...").length).toBe(0);
    });

    it("accepts custom accessibilityLabel", () => {
      const { getByLabelText } = render(
        <SkeletonListItem accessibilityLabel="Loading transaction row" />
      );
      expect(getByLabelText("Loading transaction row")).toBeTruthy();
    });
  });
});
