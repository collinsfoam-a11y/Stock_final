import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { SearchableSelectModal } from "../SearchableSelectModal";
import { haptics } from "@/services/haptics";

jest.mock("@/services/haptics", () => ({
  haptics: {
    light: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("SearchableSelectModal", () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSelect: jest.fn(),
    options: ["Alpha", "Beta", "Gamma"],
    title: "Select Item",
    placeholder: "Search items...",
    testID: "searchable-modal",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly with title and options", () => {
    const { getByText, getByTestId } = render(<SearchableSelectModal {...defaultProps} />);

    expect(getByText("Select Item")).toBeTruthy();
    expect(getByTestId("searchable-modal-option-Alpha")).toBeTruthy();
    expect(getByTestId("searchable-modal-option-Beta")).toBeTruthy();
    expect(getByTestId("searchable-modal-option-Gamma")).toBeTruthy();
  });

  it("filters options when search query is typed", () => {
    const { getByTestId, queryByTestId } = render(<SearchableSelectModal {...defaultProps} />);

    const searchInput = getByTestId("searchable-modal-search");
    fireEvent.changeText(searchInput, "bet");

    expect(getByTestId("searchable-modal-option-Beta")).toBeTruthy();
    expect(queryByTestId("searchable-modal-option-Alpha")).toBeNull();
    expect(queryByTestId("searchable-modal-option-Gamma")).toBeNull();
  });

  it("triggers haptics and callbacks when an option is selected", () => {
    const { getByTestId } = render(<SearchableSelectModal {...defaultProps} />);

    const option = getByTestId("searchable-modal-option-Alpha");
    fireEvent.press(option);

    expect(haptics.light).toHaveBeenCalled();
    expect(defaultProps.onSelect).toHaveBeenCalledWith("Alpha");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("triggers haptics and onClose when close button is pressed", () => {
    const { getByTestId } = render(<SearchableSelectModal {...defaultProps} />);

    const closeBtn = getByTestId("searchable-modal-close");
    fireEvent.press(closeBtn);

    expect(haptics.light).toHaveBeenCalled();
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("clears search query and triggers haptics when clear search button is pressed", () => {
    const { getByTestId, getByLabelText, queryByLabelText } = render(<SearchableSelectModal {...defaultProps} />);

    const searchInput = getByTestId("searchable-modal-search");
    fireEvent.changeText(searchInput, "Alpha");

    const clearButton = getByLabelText("Clear search query");
    expect(clearButton).toBeTruthy();

    fireEvent.press(clearButton);

    expect(haptics.light).toHaveBeenCalled();
    expect(searchInput.props.value).toBe("");
    expect(queryByLabelText("Clear search query")).toBeNull();
  });

  it("applies proper accessibility properties", () => {
    const { getByText, getByTestId } = render(<SearchableSelectModal {...defaultProps} />);

    const titleText = getByText("Select Item");
    expect(titleText.props.accessibilityRole).toBe("header");

    const option = getByTestId("searchable-modal-option-Alpha");
    expect(option.props.accessibilityRole).toBe("button");
    expect(option.props.accessibilityLabel).toBe("Alpha");
    expect(option.props.accessibilityHint).toBe("Selects Alpha");

    const closeBtn = getByTestId("searchable-modal-close");
    expect(closeBtn.props.accessibilityRole).toBe("button");
    expect(closeBtn.props.accessibilityLabel).toBe("Close modal");
  });
});
