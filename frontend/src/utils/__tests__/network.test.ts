import {
  getNetworkStatus,
  isDefinitelyOnline,
  shouldAttemptApiCall,
  isDefinitelyOffline,
  isNetworkUnknown,
  isOnline,
} from "../network";
import { useNetworkStore } from "../../store/networkStore";

// Mock the network store
jest.mock("../../store/networkStore", () => ({
  useNetworkStore: {
    getState: jest.fn(),
  },
}));

describe("Network Utilities", () => {
  const mockGetState = useNetworkStore.getState as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getNetworkStatus", () => {
    it("should return OFFLINE when isRestrictedMode is true", () => {
      mockGetState.mockReturnValue({
        isOnline: true,
        isInternetReachable: true,
        connectionType: "wifi",
        isRestrictedMode: true,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "OFFLINE",
        isOnline: true,
        isInternetReachable: true,
        connectionType: "wifi",
        shouldAttemptApi: false,
        shouldAllowWrites: false,
      });
    });

    it("should return UNKNOWN when isOnline is undefined", () => {
      mockGetState.mockReturnValue({
        isOnline: undefined,
        isInternetReachable: null,
        connectionType: "unknown",
        isRestrictedMode: false,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "UNKNOWN",
        isOnline: false,
        isInternetReachable: null,
        connectionType: "unknown",
        shouldAttemptApi: true,
        shouldAllowWrites: false,
      });
    });

    it("should return UNKNOWN when isOnline is null", () => {
      mockGetState.mockReturnValue({
        isOnline: null,
        isInternetReachable: null,
        connectionType: "unknown",
        isRestrictedMode: false,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "UNKNOWN",
        isOnline: false,
        isInternetReachable: null,
        connectionType: "unknown",
        shouldAttemptApi: true,
        shouldAllowWrites: false,
      });
    });

    it("should return OFFLINE when isOnline is false", () => {
      mockGetState.mockReturnValue({
        isOnline: false,
        isInternetReachable: false,
        connectionType: "none",
        isRestrictedMode: false,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "OFFLINE",
        isOnline: false,
        isInternetReachable: false,
        connectionType: "none",
        shouldAttemptApi: false,
        shouldAllowWrites: false,
      });
    });

    it("should return OFFLINE when isInternetReachable is false", () => {
      mockGetState.mockReturnValue({
        isOnline: true,
        isInternetReachable: false,
        connectionType: "wifi",
        isRestrictedMode: false,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "OFFLINE",
        isOnline: true,
        isInternetReachable: false,
        connectionType: "wifi",
        shouldAttemptApi: false,
        shouldAllowWrites: false,
      });
    });

    it("should return ONLINE when isInternetReachable is true", () => {
      mockGetState.mockReturnValue({
        isOnline: true,
        isInternetReachable: true,
        connectionType: "wifi",
        isRestrictedMode: false,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "ONLINE",
        isOnline: true,
        isInternetReachable: true,
        connectionType: "wifi",
        shouldAttemptApi: true,
        shouldAllowWrites: true,
      });
    });

    it("should return UNKNOWN when isOnline is true but isInternetReachable is null", () => {
      mockGetState.mockReturnValue({
        isOnline: true,
        isInternetReachable: null,
        connectionType: "cellular",
        isRestrictedMode: false,
      });

      const result = getNetworkStatus();

      expect(result).toEqual({
        status: "UNKNOWN",
        isOnline: true,
        isInternetReachable: null,
        connectionType: "cellular",
        shouldAttemptApi: true,
        shouldAllowWrites: false,
      });
    });
  });

  describe("Helper Functions", () => {
    describe("isDefinitelyOnline", () => {
      it("should return true when status is ONLINE", () => {
        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: true, isRestrictedMode: false });
        expect(isDefinitelyOnline()).toBe(true);
      });

      it("should return false when status is OFFLINE or UNKNOWN", () => {
        mockGetState.mockReturnValue({ isOnline: false, isInternetReachable: false, isRestrictedMode: false });
        expect(isDefinitelyOnline()).toBe(false);

        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: null, isRestrictedMode: false });
        expect(isDefinitelyOnline()).toBe(false);
      });
    });

    describe("shouldAttemptApiCall", () => {
      it("should return true when status is not OFFLINE", () => {
        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: true, isRestrictedMode: false });
        expect(shouldAttemptApiCall()).toBe(true); // ONLINE

        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: null, isRestrictedMode: false });
        expect(shouldAttemptApiCall()).toBe(true); // UNKNOWN
      });

      it("should return false when status is OFFLINE", () => {
        mockGetState.mockReturnValue({ isOnline: false, isRestrictedMode: false });
        expect(shouldAttemptApiCall()).toBe(false);
      });
    });

    describe("isDefinitelyOffline", () => {
      it("should return true when status is OFFLINE", () => {
        mockGetState.mockReturnValue({ isOnline: false, isRestrictedMode: false });
        expect(isDefinitelyOffline()).toBe(true);

        mockGetState.mockReturnValue({ isRestrictedMode: true });
        expect(isDefinitelyOffline()).toBe(true);
      });

      it("should return false when status is ONLINE or UNKNOWN", () => {
        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: true, isRestrictedMode: false });
        expect(isDefinitelyOffline()).toBe(false); // ONLINE

        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: null, isRestrictedMode: false });
        expect(isDefinitelyOffline()).toBe(false); // UNKNOWN
      });
    });

    describe("isNetworkUnknown", () => {
      it("should return true when status is UNKNOWN", () => {
        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: null, isRestrictedMode: false });
        expect(isNetworkUnknown()).toBe(true);
      });

      it("should return false when status is ONLINE or OFFLINE", () => {
        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: true, isRestrictedMode: false });
        expect(isNetworkUnknown()).toBe(false);

        mockGetState.mockReturnValue({ isOnline: false, isRestrictedMode: false });
        expect(isNetworkUnknown()).toBe(false);
      });
    });

    describe("isOnline (legacy)", () => {
      it("should behave the same as shouldAttemptApiCall", () => {
        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: true, isRestrictedMode: false });
        expect(isOnline()).toBe(true); // ONLINE

        mockGetState.mockReturnValue({ isOnline: true, isInternetReachable: null, isRestrictedMode: false });
        expect(isOnline()).toBe(true); // UNKNOWN

        mockGetState.mockReturnValue({ isOnline: false, isRestrictedMode: false });
        expect(isOnline()).toBe(false); // OFFLINE
      });
    });
  });
});
