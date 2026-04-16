import { renderHook } from "@testing-library/react-native";
import { usePermission } from "../usePermission";
import { useAuthStore } from "../../store/authStore";
import { Role } from "../../constants/permissions";

jest.mock("../../store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;

describe("usePermission", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("keeps permission helpers stable across rerenders for the same user", () => {
    const user = {
      role: "admin",
      permissions: ["user.manage", "settings.manage"],
    };

    mockUseAuthStore.mockImplementation((selector: any) => selector({ user }));

    const { result, rerender } = renderHook(() => usePermission());
    const firstHasRole = result.current.hasRole;
    const firstHasPermission = result.current.hasPermission;

    rerender(undefined);

    expect(result.current.hasRole).toBe(firstHasRole);
    expect(result.current.hasPermission).toBe(firstHasPermission);
    expect(result.current.hasRole(Role.ADMIN)).toBe(true);
    expect(result.current.hasPermission("user.manage")).toBe(true);
  });

  it("keeps empty permissions stable when no user is loaded", () => {
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ user: null }),
    );

    const { result, rerender } = renderHook(() => usePermission());
    const firstPermissions = result.current.permissions;
    const firstHasRole = result.current.hasRole;

    rerender(undefined);

    expect(result.current.permissions).toBe(firstPermissions);
    expect(result.current.hasRole).toBe(firstHasRole);
    expect(result.current.hasRole(Role.ADMIN)).toBe(false);
  });
});
