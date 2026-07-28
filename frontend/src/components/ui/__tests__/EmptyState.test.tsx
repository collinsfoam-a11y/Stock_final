import React from "react";
import { render } from "@testing-library/react-native";
import { EmptyState } from "../EmptyState";
import { ThemeProvider } from "../../../context/ThemeContext";

// NOTE: mock factories below use React.createElement rather than JSX. JSX inside a
// jest.mock() factory crashes babel-plugin-jest-hoist when combined with
// babel-preset-expo ("expected node to be of a type VariableDeclarator").

// Mock FadeIn as it uses animations which might interfere with simple tests
jest.mock("../FadeIn", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    FadeIn: ({ children, style }: any) =>
      ReactActual.createElement(View, { style }, children),
  };
});

// Mock ModernButton
jest.mock("../ModernButton", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text, TouchableOpacity } = require("react-native");
  return {
    ModernButton: ({ title, onPress }: any) =>
      ReactActual.createElement(
        TouchableOpacity,
        { onPress },
        ReactActual.createElement(Text, null, title)
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
