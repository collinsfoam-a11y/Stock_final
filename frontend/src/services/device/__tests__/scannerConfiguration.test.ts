import { ScannerConfigurationManager, ScannerConfigResponse } from "../scannerConfigurationManager";
import { mmkvStorage } from "../../mmkvStorage";
import defaultConfig from "../../../../assets/default-scanner-config.json";

jest.mock("../../mmkvStorage", () => ({
  mmkvStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

describe("ScannerConfigurationManager Validation & Security", () => {
  let manager: ScannerConfigurationManager;

  const validMockConfig: ScannerConfigResponse = {
    metadata: {
      version: 99,
      schemaVersion: 1,
      checksum: "valid-hash",
      minimumAppVersion: "2.5.0",
      updatedAt: "2026-07-23T12:00:00Z"
    },
    configuration: {
      profiles: {},
      rankingPolicies: {},
      featureFlags: {
        adaptiveROI: true,
        adaptiveLearning: true,
        aiQualityAnalyzer: true,
        gs1ParserV2: true,
        experimentalAutofocus: false,
        advancedRanking: true,
        telemetryEnabled: true
      },
      telemetry: { analyticsEnabled: true, errorReportingEnabled: true },
      rollout: { percentage: 100 },
      constraints: { minOsVersion: "12.0", requireHighPerformance: false }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should load bundled fallback when cache is empty", () => {
    (mmkvStorage.getItem as jest.Mock).mockReturnValue(null);
    manager = new ScannerConfigurationManager();
    expect(manager.getMetadata().version).toBe(defaultConfig.metadata.version);
  });

  it("should load cache when valid and newer than bundled", () => {
    (mmkvStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === "scanner_config_response_cache") return JSON.stringify(validMockConfig);
      return null;
    });
    manager = new ScannerConfigurationManager();
    expect(manager.getMetadata().version).toBe(99);
  });

  it("should reject invalid schemaVersion", () => {
    const badSchema = { ...validMockConfig, metadata: { ...validMockConfig.metadata, schemaVersion: 2 } };
    (mmkvStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === "scanner_config_response_cache") return JSON.stringify(badSchema);
      return null;
    });
    manager = new ScannerConfigurationManager();
    // Falls back to bundled because validation fails
    expect(manager.getMetadata().version).toBe(defaultConfig.metadata.version);
  });

  it("should reject incompatible minimumAppVersion", () => {
    // Current app version is hardcoded to 2.6.0 in the manager for validation context
    const futureApp = { ...validMockConfig, metadata: { ...validMockConfig.metadata, minimumAppVersion: "3.0.0" } };
    (mmkvStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === "scanner_config_response_cache") return JSON.stringify(futureApp);
      return null;
    });
    manager = new ScannerConfigurationManager();
    expect(manager.getMetadata().version).toBe(defaultConfig.metadata.version);
  });

  it("should reject missing checksum", () => {
    const noChecksum = { ...validMockConfig, metadata: { ...validMockConfig.metadata, checksum: "" } };
    (mmkvStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === "scanner_config_response_cache") return JSON.stringify(noChecksum);
      return null;
    });
    manager = new ScannerConfigurationManager();
    expect(manager.getMetadata().version).toBe(defaultConfig.metadata.version);
  });

  it("should safely notify subscribers without memory accumulation (hot reload)", () => {
    (mmkvStorage.getItem as jest.Mock).mockReturnValue(null);
    manager = new ScannerConfigurationManager();

    const mockCallback = jest.fn();
    const unsubscribe = manager.subscribe(mockCallback);
    
    // Simulate valid update
    manager.updateConfiguration(validMockConfig);
    expect(mockCallback).toHaveBeenCalledTimes(1);
    
    unsubscribe();
    
    const anotherUpdate = { ...validMockConfig, metadata: { ...validMockConfig.metadata, version: 100 } };
    manager.updateConfiguration(anotherUpdate);
    // Should NOT be called again
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });
});
