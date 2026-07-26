import React from "react";
import { render } from "@testing-library/react-native";
import { EmptyState } from "../EmptyState";
import { ThemeProvider } from "../../../context/ThemeContext";

// Mock FadeIn as it uses animations which might interfere with simple tests
jest.mock("../FadeIn", () => {
  const { View } = require("react-native");
  return {
    FadeIn: ({ children, style }: any) => <View style={style}>{children}</View>,
  };
});

// Mock ModernButton
jest.mock("../ModernButton", () => {
  const { Text, TouchableOpacity } = require("react-native");
  return {
    ModernButton: ({ title, onPress }: any) => (
      <TouchableOpacity onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
  };
});

describe("EmptyState", () => {
  const defaultProps = {
    title: "No Data",
    message: "There is nothing here.",
  };

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider>{ui}</ThemeProvider>);
  };

  it("renders correctly with title and message", () => {
    const { getByText } = renderWithTheme(<EmptyState {...defaultProps} />);
    expect(getByText("No Data")).toBeTruthy();
    expect(getByText("There is nothing here.")).toBeTruthy();
  });

  it("has correct accessibility role for the title", () => {
    const { getByText } = renderWithTheme(<EmptyState {...defaultProps} />);
    const titleElement = getByText("No Data");
    expect(titleElement.props.accessibilityRole).toBe("header");
  });

  it("has correct accessibility label for the text container", () => {
    const { getByLabelText } = renderWithTheme(<EmptyState {...defaultProps} />);
    const container = getByLabelText("No Data. There is nothing here.");
    expect(container).toBeTruthy();
    expect(container.props.accessible).toBe(true);
  });

  it("uses custom accessibility label when provided", () => {
    const { getByLabelText } = renderWithTheme(
      <EmptyState {...defaultProps} accessibilityLabel="Custom Label" />
    );
    expect(getByLabelText("Custom Label")).toBeTruthy();
  });

  it("renders action button when actionLabel and onAction are provided", () => {
    const onAction = jest.fn();
    const { getByText } = renderWithTheme(
      <EmptyState {...defaultProps} actionLabel="Refresh" onAction={onAction} />
    );
    expect(getByText("Refresh")).toBeTruthy();
  });
});
