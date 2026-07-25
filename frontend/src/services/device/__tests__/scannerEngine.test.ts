import { ScannerEngine, SCANNER_PROFILES, rankDetectedBarcodes } from "../scannerEngine";

describe("ScannerEngine", () => {
  let engine: ScannerEngine;

  beforeEach(() => {
    engine = ScannerEngine.getInstance();
  });

  test("resolves correct adaptive scanner profile for serialized workflow", () => {
    const profileMgr = engine.getProfileManager();
    const profile = profileMgr.resolveProfileForWorkflow(true, false);

    expect(profile.type).toBe("serial_only");
    expect(profile.symbologies).toEqual(["code-128", "code-39"]);
    expect(profile.camera.fps).toBe(60);
  });

  test("resolves correct adaptive profile for dense 2D barcode workflow", () => {
    const profileMgr = engine.getProfileManager();
    const profile = profileMgr.resolveProfileForWorkflow(false, true);

    expect(profile.type).toBe("dense_2d");
    expect(profile.symbologies).toContain("qr");
    expect(profile.symbologies).toContain("data-matrix");
  });

  test("AI Scan Quality Analyzer generates recommendations based on brightness and motion", () => {
    const analyzer = engine.getQualityAnalyzer();

    const lowLight = analyzer.analyzeFrame({ brightnessSample: 0.1, motionDelta: 0.05 });
    expect(lowLight.score).toBeLessThan(100);
    expect(lowLight.recommendation).toContain("Low light");

    const highMotion = analyzer.analyzeFrame({ brightnessSample: 0.5, motionDelta: 0.5 });
    expect(highMotion.recommendation).toContain("Hold phone steady");

    const optimal = analyzer.analyzeFrame({ brightnessSample: 0.5, motionDelta: 0.05 });
    expect(optimal.score).toBe(100);
    expect(optimal.recommendation).toBe("Optimal scan alignment");
  });

  test("ROIManager computes centered bounding box based on profile ratios", () => {
    const roiMgr = engine.getROIManager();
    const profile = SCANNER_PROFILES.serial_only; // 0.8 width, 0.3 height

    const bounds = roiMgr.calculateROI(profile, 400, 800);
    expect(bounds.width).toBe(320); // 400 * 0.8
    expect(bounds.height).toBe(240); // 800 * 0.3
    expect(bounds.x).toBe(40); // (400 - 320) / 2
    expect(bounds.y).toBe(280); // (800 - 240) / 2
  });

  test("delegates classification seamlessly through facade", () => {
    const res = engine.classifyScannedBarcode("HM43G2B8T5G23A0104");
    expect(res.kind).toBe("serial");
    expect(res.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("CapabilityManager auto-detects hardware tier and profile", () => {
    const capMgr = engine.getCapabilityManager();
    const caps = capMgr.detectCapabilities();

    expect(caps.maxFps).toBeGreaterThanOrEqual(30);
    expect(caps.recommendedResolution).toBe("1080p");
  });

  test("rankDetectedBarcodes selects closest barcode to ROI center with default policy", () => {
    const candidates = [
      { rawValue: "DISTANT_CODE", distanceFromCenterPx: 250, areaPx: 100 },
      { rawValue: "CENTER_CODE", distanceFromCenterPx: 12, areaPx: 150 },
    ];

    const configMgr = engine.getConfigManager();
    const policy = configMgr.getRankingPolicy();
    const best = rankDetectedBarcodes(candidates, undefined, policy);
    expect(best?.rawValue).toBe("CENTER_CODE");
  });

  test("rankDetectedBarcodes applies custom policy weights", () => {
    const candidates = [
      { rawValue: "DISTANT_MATCH", distanceFromCenterPx: 250, areaPx: 100 },
      { rawValue: "CENTER_CODE", distanceFromCenterPx: 12, areaPx: 150 },
    ];
    
    // Custom policy ignores distance and strongly prefers workflow match
    const policy = {
      workflowWeight: 100,
      confidenceWeight: 0,
      roiWeight: 0,
      areaWeight: 0
    };
    
    // DISTANT_MATCH is the expected item
    const best = rankDetectedBarcodes(candidates, "DISTANT_MATCH", policy);
    expect(best?.rawValue).toBe("DISTANT_MATCH");
  });

  test("ScannerConfigurationManager overrides profile symbologies", () => {
    const configMgr = engine.getConfigManager();
    const config = configMgr.getConfiguration();
    
    // Apply override
    configMgr.updateConfiguration({
      metadata: { ...configMgr.getMetadata(), version: configMgr.getMetadata().version + 1 },
      configuration: {
        ...config,
        profiles: {
          serial_only: { symbologies: ["custom-override-128"] }
        }
      }
    });
    
    const profileMgr = engine.getProfileManager();
    const profile = profileMgr.resolveProfileForWorkflow(true, false);
    expect(profile.symbologies).toEqual(["custom-override-128"]);
  });
});
