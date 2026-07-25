import { Platform } from "react-native";
import type { ScannerProfileType } from "./scannerEngine";

export interface CertifiedProfile {
  recommendedFps: number;
  recommendedResolution: "1080p" | "720p" | "4k";
  recommendedProfile: ScannerProfileType;
  performanceTier: "flagship" | "mid_range" | "entry_level";
}

export interface CertifiedProfileResult {
  profile: CertifiedProfile;
  source: "exact_model" | "manufacturer_family" | "heuristic" | "generic_default";
}

export class DeviceCertificationRegistry {
  private static instance: DeviceCertificationRegistry;
  
  // Mapping of OS_Model to CertifiedProfile
  private registry: Record<string, CertifiedProfile> = {
    "ios_iphone15,2": { // iPhone 14 Pro
      recommendedFps: 60,
      recommendedResolution: "1080p",
      recommendedProfile: "warehouse_mixed",
      performanceTier: "flagship"
    },
    "ios_iphone16,1": { // iPhone 15 Pro
      recommendedFps: 60,
      recommendedResolution: "4k",
      recommendedProfile: "warehouse_mixed",
      performanceTier: "flagship"
    },
    "android_sm-g998b": { // Galaxy S21 Ultra
      recommendedFps: 60,
      recommendedResolution: "1080p",
      recommendedProfile: "warehouse_mixed",
      performanceTier: "flagship"
    },
    "android_ct50": {
      // Example of an older rugged scanner
      recommendedFps: 30,
      recommendedResolution: "720p",
      recommendedProfile: "serial_only",
      performanceTier: "entry_level"
    }
  };

  // Mapping of OS_Manufacturer to CertifiedProfile
  private familyRegistry: Record<string, CertifiedProfile> = {
    "android_zebra": {
      recommendedFps: 60,
      recommendedResolution: "1080p",
      recommendedProfile: "serial_only",
      performanceTier: "mid_range"
    },
    "android_honeywell": {
      recommendedFps: 30,
      recommendedResolution: "720p",
      recommendedProfile: "warehouse_mixed",
      performanceTier: "mid_range"
    },
    "ios_apple": {
      recommendedFps: 60,
      recommendedResolution: "1080p",
      recommendedProfile: "warehouse_mixed",
      performanceTier: "flagship"
    }
  };

  public static getInstance(): DeviceCertificationRegistry {
    if (!DeviceCertificationRegistry.instance) {
      DeviceCertificationRegistry.instance = new DeviceCertificationRegistry();
    }
    return DeviceCertificationRegistry.instance;
  }

  /**
   * Returns a certified profile using a deterministic fallback order:
   * Exact Model -> Manufacturer+Family -> Capability Heuristics -> Generic Default
   */
  public getCertifiedProfile(model: string, os: string, manufacturer?: string): CertifiedProfileResult {
    const osLower = os.toLowerCase();
    
    // 1. Exact Model
    const exactKey = `${osLower}_${model.toLowerCase()}`;
    if (this.registry[exactKey]) {
      return { profile: this.registry[exactKey], source: "exact_model" };
    }

    // 2. Manufacturer + Family
    if (manufacturer) {
      const familyKey = `${osLower}_${manufacturer.toLowerCase()}`;
      if (this.familyRegistry[familyKey]) {
        return { profile: this.familyRegistry[familyKey], source: "manufacturer_family" };
      }
    } else if (osLower === "ios") {
       // fallback for Apple if manufacturer wasn't passed explicitly
       return { profile: this.familyRegistry["ios_apple"] as CertifiedProfile, source: "manufacturer_family" };
    }

    // 3. Capability Heuristics
    // Basic heuristic based on OS platform expectations in our deployment environment
    if (osLower === "ios") {
      return {
        profile: {
          recommendedFps: 60,
          recommendedResolution: "1080p",
          recommendedProfile: "warehouse_mixed",
          performanceTier: "flagship"
        },
        source: "heuristic"
      };
    } else if (osLower === "android") {
      return {
        profile: {
          recommendedFps: 30,
          recommendedResolution: "1080p",
          recommendedProfile: "serial_only",
          performanceTier: "mid_range"
        },
        source: "heuristic"
      };
    }

    // 4. Generic Default
    return {
      profile: {
        recommendedFps: 30,
        recommendedResolution: "720p",
        recommendedProfile: "serial_only",
        performanceTier: "entry_level"
      },
      source: "generic_default"
    };
  }
}
