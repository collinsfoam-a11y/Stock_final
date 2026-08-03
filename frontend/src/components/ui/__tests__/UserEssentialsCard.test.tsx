import React from "react";
import { render } from "@testing-library/react-native";
import { UserEssentialsCard } from "../UserEssentialsCard";

const mockUser = {
  username: "testuser",
  full_name: "Test User",
  role: "staff" as const,
};

describe("UserEssentialsCard", () => {
  it("renders user name from full_name", () => {
    const { getByText } = render(<UserEssentialsCard user={mockUser} />);
    expect(getByText("Test User")).toBeTruthy();
  });

  it("falls back to username when full_name is null", () => {
    const userWithoutName = {
      username: "fallbackuser",
      full_name: null,
      role: "staff" as const,
    };
    const { getByText } = render(<UserEssentialsCard user={userWithoutName} />);
    expect(getByText("fallbackuser")).toBeTruthy();
  });

  it("renders username as @username when full_name differs", () => {
    const { getByText } = render(<UserEssentialsCard user={mockUser} />);
    expect(getByText("@testuser")).toBeTruthy();
  });

  it("renders role badge with capitalized role", () => {
    const { getByText } = render(<UserEssentialsCard user={mockUser} showRole={true} />);
    expect(getByText("Staff")).toBeTruthy();
  });

  it("hides role badge when showRole is false", () => {
    const { queryByText } = render(<UserEssentialsCard user={mockUser} showRole={false} />);
    expect(queryByText("Staff")).toBeNull();
  });

  it("shows active status dot by default", () => {
    const { getByLabelText } = render(<UserEssentialsCard user={mockUser} />);
    expect(getByLabelText("Active")).toBeTruthy();
  });

  it("shows inactive status when is_active is false", () => {
    const inactiveUser = { ...mockUser, is_active: false };
    const { getByLabelText } = render(<UserEssentialsCard user={inactiveUser} />);
    expect(getByLabelText("Inactive")).toBeTruthy();
  });

  it("hides status when showStatus is false", () => {
    const { queryByLabelText } = render(<UserEssentialsCard user={mockUser} showStatus={false} />);
    expect(queryByLabelText("Active")).toBeNull();
    expect(queryByLabelText("Inactive")).toBeNull();
  });

  it("renders employee_id when provided", () => {
    const userWithId = { ...mockUser, employee_id: "EMP001" };
    const { getByText } = render(<UserEssentialsCard user={userWithId} />);
    expect(getByText("ID: EMP001")).toBeTruthy();
  });

  it("renders admin role badge", () => {
    const adminUser = { ...mockUser, role: "admin" as const };
    const { getByText } = render(<UserEssentialsCard user={adminUser} />);
    expect(getByText("Admin")).toBeTruthy();
  });

  it("renders supervisor role badge", () => {
    const supervisorUser = { ...mockUser, role: "supervisor" as const };
    const { getByText } = render(<UserEssentialsCard user={supervisorUser} />);
    expect(getByText("Supervisor")).toBeTruthy();
  });

  it("has correct accessibility label with status", () => {
    const { getByLabelText } = render(<UserEssentialsCard user={mockUser} />);
    expect(getByLabelText("User Test User, role staff, active")).toBeTruthy();
  });

  it("has correct testID when not provided", () => {
    const { getByTestId } = render(<UserEssentialsCard user={mockUser} />);
    expect(getByTestId("user-essentials-testuser")).toBeTruthy();
  });

  it("uses custom testID when provided", () => {
    const { getByTestId } = render(
      <UserEssentialsCard user={mockUser} testID="custom-user-card" />
    );
    expect(getByTestId("custom-user-card")).toBeTruthy();
  });
});
