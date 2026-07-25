/**
 * Stock Verify v2.3 — Centralized Intelligent Scanner Engine
 * Manages adaptive camera profiles, ROI cropping, frame quality analysis,
 * and exposure/focus controls.
 */

import { Platform } from "react-native";
import { BarcodeKind, BarcodeClassification, classifyBarcode } from "../../utils/barcodeClassifier";

export type ScannerProfileType =
  | "serial_only"
  | "retail_barcode"
  | "dense_2d"
  | "warehouse_mixed"
  | "long_distance";

import { ScannerConfigurationManager, ScannerRankingPolicy } from "./scannerConfigurationManager";

export interface ScannerProfile {
  type: ScannerProfileType;
  symbologies: string[];
  roiRatio: { width: number; height: number };
  description: string;
  camera: {
    fps?: number;
    resolution?: "720p" | "1080p" | "4k";
    autoFocus?: "continuous" | "macro" | "fixed";
    zoom?: number;
    exposure?: number;
  };
}

export interface ScanQuality {
  score: number; // 0 to 100
  blur: number; // 0 (crisp) to 1.0 (blurry)
  brightness: number; // 0 (dark) to 1.0 (glare)
  motion: number; // 0 (still) to 1.0 (moving)
  recommendation: string;
}

export interface ROIBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// -------------------------------------------------------------
// 1. SCANNER PROFILE MANAGER
// -------------------------------------------------------------
export const SCANNER_PROFILES: Record<ScannerProfileType, ScannerProfile> = {
  serial_only: {
    type: "serial_only",
    symbologies: ["code-128", "code-39"],
    roiRatio: { width: 0.8, height: 0.3 },
    description: "Ultra-fast throughput for Code128/Code39 serials",
    camera: {
      fps: 60,
      resolution: "1080p",
      autoFocus: "continuous",
      zoom: 1.0,
    }
  },
  retail_barcode: {
    type: "retail_barcode",
    symbologies: ["ean-13", "ean-8", "upc-a", "itf"],
    roiRatio: { width: 0.85, height: 0.4 },
    description: "Optimized for product EAN-13, UPC-A, and EAN-8",
    camera: {
      fps: 60,
      resolution: "1080p",
      autoFocus: "continuous",
      zoom: 1.0,
    }
  },
  dense_2d: {
    type: "dense_2d",
    symbologies: ["qr", "data-matrix", "pdf417", "aztec"],
    roiRatio: { width: 0.6, height: 0.6 },
    description: "High-precision decoder for QR and GS1 DataMatrix",
    camera: {
      fps: 30,
      resolution: "1080p",
      autoFocus: "macro",
      zoom: 1.2,
    }
  },
  warehouse_mixed: {
    type: "warehouse_mixed",
    symbologies: ["code-128", "code-39", "qr", "data-matrix", "pdf417", "ean-13"],
    roiRatio: { width: 0.75, height: 0.5 },
    description: "Adaptive mode supporting all warehouse symbologies",
    camera: {
      fps: 60,
      resolution: "1080p",
      autoFocus: "continuous",
      zoom: 1.0,
    }
  },
  long_distance: {
    type: "long_distance",
    symbologies: ["code-128", "qr", "data-matrix"],
    roiRatio: { width: 0.5, height: 0.5 },
    description: "High-zoom mode for top rack labels",
    camera: {
      fps: 60,
      resolution: "1080p",
      autoFocus: "continuous",
      zoom: 2.0,
    }
  },
};

export class ScannerProfileManager {
  private currentProfile: ScannerProfile = SCANNER_PROFILES.warehouse_mixed;
  private configManager: ScannerConfigurationManager;

  constructor(configManager: ScannerConfigurationManager) {
    this.configManager = configManager;
  }

  public getProfile(): ScannerProfile {
    return this.currentProfile;
  }

  public setProfile(type: ScannerProfileType): ScannerProfile {
    const baseProfile = SCANNER_PROFILES[type] || SCANNER_PROFILES.warehouse_mixed;
    const overrides = this.configManager.getProfileOverrides(baseProfile.type);

    this.currentProfile = overrides 
      ? { ...baseProfile, ...overrides } 
      : baseProfile;
      
    return this.currentProfile;
  }

  public resolveProfileForWorkflow(isSerialized: boolean, has2D: boolean): ScannerProfile {
    if (isSerialized && !has2D) return this.setProfile("serial_only");
    if (has2D) return this.setProfile("dense_2d");
    return this.setProfile("warehouse_mixed");
  }
}

// -------------------------------------------------------------
// 2. AI SCAN QUALITY ANALYZER
// -------------------------------------------------------------
export class ScanQualityAnalyzer {
  public analyzeFrame(frameData: {
    brightnessSample?: number;
    motionDelta?: number;
    codeLength?: number;
  }): ScanQuality {
    const brightness = frameData.brightnessSample ?? 0.5;
    const motion = frameData.motionDelta ?? 0.1;
    const blur = motion > 0.4 ? 0.8 : 0.1;

    let score = 100;
    let recommendation = "Scanning...";

    if (brightness < 0.2) {
      score -= 30;
      recommendation = "Low light — Turn on torch";
    } else if (brightness > 0.85) {
      score -= 25;
      recommendation = "Glare detected — Adjust angle";
    }

    if (motion > 0.35) {
      score -= 35;
      recommendation = "Hold phone steady";
    }

    if (score >= 80) {
      recommendation = "Optimal scan alignment";
    }

    return {
      score: Math.max(0, score),
      blur,
      brightness,
      motion,
      recommendation,
    };
  }
}

// -------------------------------------------------------------
// 3. ADAPTIVE ROI MANAGER
// -------------------------------------------------------------
export class ROIManager {
  public calculateROI(
    profile: ScannerProfile,
    screenWidth: number,
    screenHeight: number
  ): ROIBounds {
    const width = screenWidth * profile.roiRatio.width;
    const height = screenHeight * profile.roiRatio.height;
    const x = (screenWidth - width) / 2;
    const y = (screenHeight - height) / 2;

    return { x, y, width, height };
  }
}

// -------------------------------------------------------------
// 5. HARDWARE CAPABILITY MANAGER
// -------------------------------------------------------------
import { DeviceCertificationRegistry } from "./deviceCertification";

export interface DeviceHardwareProfile {
  tier: "flagship" | "mid_range" | "entry_level";
  maxFps: number;
  recommendedResolution: "1080p" | "720p" | "4k";
  recommendedProfile: ScannerProfileType;
}

export class CapabilityManager {
  public detectCapabilities(): DeviceHardwareProfile {
    const isIOS = Platform.OS === "ios";
    
    // We could use expo-device here if available. For now we use generic hints.
    // In a real app we'd pass the actual device model and manufacturer.
    const model = isIOS ? "iphone15,2" : "sm-g998b";
    
    const registry = DeviceCertificationRegistry.getInstance();
    const result = registry.getCertifiedProfile(model, Platform.OS);
    
    return {
      tier: result.profile.performanceTier,
      maxFps: result.profile.recommendedFps,
      recommendedResolution: result.profile.recommendedResolution,
      recommendedProfile: result.profile.recommendedProfile,
    };
  }
}

// -------------------------------------------------------------
// 7. MULTI-BARCODE CANDIDATE RANKER
// -------------------------------------------------------------
export interface ScannedCandidate {
  rawValue: string;
  distanceFromCenterPx?: number;
  areaPx?: number;
  codeType?: string;
  decoderConfidence?: number; // 0.0 to 1.0
}

/**
 * Multi-Barcode Candidate Ranker
 * Evaluates candidates using weighted scoring:
 * 1. Workflow Match
 * 2. Decoder Confidence
 * 3. Distance from ROI Center
 * 4. Bounding Box Area
 */
export function rankDetectedBarcodes(
  candidates: ScannedCandidate[],
  itemBarcode?: string,
  policy?: ScannerRankingPolicy
): ScannedCandidate | null {
  if (!candidates || candidates.length === 0) return null;

  const maxDistance = 500; // max expected ROI radius in px
  const maxArea = 40000; // max expected bounding area in px^2

  const activePolicy = policy;
  
  if (!activePolicy) {
    return candidates[0] || null;
  }

  const scored = candidates.map((cand) => {
    // 1. Workflow Match Score
    const workflowMatch = itemBarcode && cand.rawValue === itemBarcode ? 1.0 : 0.0;
    const scoreWorkflow = workflowMatch * activePolicy.workflowWeight;

    // 2. Decoder Confidence Score
    const conf = cand.decoderConfidence ?? 0.9;
    const scoreConf = conf * activePolicy.confidenceWeight;

    // 3. ROI Distance Score (inverted: closer is higher)
    const dist = Math.min(cand.distanceFromCenterPx ?? maxDistance, maxDistance);
    const scoreDist = (1.0 - dist / maxDistance) * activePolicy.roiWeight;

    // 4. Barcode Area Score
    const area = Math.min(cand.areaPx ?? 0, maxArea);
    const scoreArea = (area / maxArea) * activePolicy.areaWeight;

    const totalScore = scoreWorkflow + scoreConf + scoreDist + scoreArea;

    return { candidate: cand, score: totalScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.candidate || null;
}

import { ScannerAnalytics, ReplayMetadataV1 } from "../analytics/scannerAnalytics";

// -------------------------------------------------------------
// 4. CENTRALIZED SCANNER ENGINE FACADE
// -------------------------------------------------------------
export interface ScannerHealth {
  isCameraOpen: boolean;
  isSessionStarted: boolean;
  isDecoderInitialized: boolean;
  isProfileApplied: boolean;
  hasFirstScanSucceeded: boolean;
}

export class ScannerEngine {
  private static instance: ScannerEngine;

  private configManager = new ScannerConfigurationManager();
  private profileManager = new ScannerProfileManager(this.configManager);
  private qualityAnalyzer = new ScanQualityAnalyzer();
  private roiManager = new ROIManager();
  private capabilityManager = new CapabilityManager();
  private analytics = ScannerAnalytics.getInstance();

  private unsubscribeConfig?: () => void;
  
  // Health tracking for transactional rollback
  private healthState: ScannerHealth = {
    isCameraOpen: false,
    isSessionStarted: false,
    isDecoderInitialized: false,
    isProfileApplied: false,
    hasFirstScanSucceeded: false
  };

  private constructor() {
    // Hot reload: subscribe to configuration updates transactionally
    this.unsubscribeConfig = this.configManager.subscribe(async (newConfig) => {
      console.info("[ScannerEngine] Configuration updated. Validating health contract...");
      
      // Reset health for new configuration validation
      this.healthState.isProfileApplied = false;
      this.healthState.hasFirstScanSucceeded = false;
      
      // Give the system a brief moment to apply the new profile and run health checks
      // In a real device environment, we would await actual camera signals.
      // Here we simulate the validation sequence:
      try {
        await this.simulateHardwareInitialization();
        
        if (!this.checkHealthContract()) {
          console.error("[ScannerEngine] Health contract failed. Rolling back.");
          this.configManager.rollback();
        } else {
          console.info("[ScannerEngine] Hot reloaded configuration updates successfully.");
        }
      } catch (e) {
         console.error("[ScannerEngine] Critical initialization failure. Rolling back.", e);
         this.configManager.rollback();
      }
    });
  }
  
  private checkHealthContract(): boolean {
    return this.healthState.isCameraOpen && 
           this.healthState.isSessionStarted && 
           this.healthState.isDecoderInitialized && 
           this.healthState.isProfileApplied;
  }
  
  private async simulateHardwareInitialization(): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate successful application in most cases
        // To strictly test rollback in UI, we'd inject a fault here if needed.
        this.healthState.isCameraOpen = true;
        this.healthState.isSessionStarted = true;
        this.healthState.isDecoderInitialized = true;
        this.healthState.isProfileApplied = true;
        resolve();
      }, 500);
    });
  }

  public reportFirstScanSuccess() {
    this.healthState.hasFirstScanSucceeded = true;
  }

  public destroy() {
    if (this.unsubscribeConfig) {
      this.unsubscribeConfig();
    }
  }

  public static getInstance(): ScannerEngine {
    if (!ScannerEngine.instance) {
      ScannerEngine.instance = new ScannerEngine();
    }
    return ScannerEngine.instance;
  }

  public getProfileManager(): ScannerProfileManager {
    return this.profileManager;
  }

  public getQualityAnalyzer(): ScanQualityAnalyzer {
    return this.qualityAnalyzer;
  }

  public getROIManager(): ROIManager {
    return this.roiManager;
  }

  public getCapabilityManager(): CapabilityManager {
    return this.capabilityManager;
  }

  public getConfigManager(): ScannerConfigurationManager {
    return this.configManager;
  }

  public getAnalytics(): ScannerAnalytics {
    return this.analytics;
  }

  public classifyScannedBarcode(
    rawValue: string,
    context?: { itemBarcode?: string; itemCode?: string }
  ): BarcodeClassification {
    const currentProfile = this.profileManager.getProfile();
    return classifyBarcode(rawValue, {
      ...context,
      codeType: currentProfile.symbologies[0],
    });
  }

  public recordReplayEvent(
    symbology: string,
    outcome: "SUCCESS" | "FAILED" | "DISCARDED" | "TIMEOUT" | "DUPLICATE",
    confidence: number = 1.0,
    blurScore: number = 0,
    brightness: number = 0,
    latencyMs: number = 0,
    retries: number = 0
  ) {
    const currentProfile = this.profileManager.getProfile();
    const configFlags = this.configManager.getFeatureFlags();
    const configVersion = this.configManager.getMetadata().version;
    this.analytics.setTelemetryEnabled(configFlags.telemetryEnabled);

    const caps = this.capabilityManager.detectCapabilities();

    const replay: ReplayMetadataV1 = {
      timestamp: Date.now(),
      runtime: {
        // Mocking battery and thermal state as they might require native modules
        batteryLevel: undefined,
        thermalState: undefined,
        droppedFrames: 0
      },
      scanner: {
        latencyMs,
        decoderConfidence: confidence,
        retries,
        symbology,
        roiSize: currentProfile.roiRatio as any,
        blurScore,
        brightness
      },
      device: {
        profile: currentProfile.type,
        tier: caps.tier,
        configVersion
      },
      result: outcome
    };

    this.analytics.recordReplay(replay);
  }
}
