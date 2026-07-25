import { mmkvStorage } from "../mmkvStorage";
import type { ScannerProfileType, ScannerProfile } from "./scannerEngine";
import { createLogger } from "../logging";
import bundledConfigResponse from "../../../assets/default-scanner-config.json";
import { getBackendURL } from "../backendUrl";
import { SignatureVerifier } from "./signatureVerifier";
import { ScannerAuditLogger } from "./scannerAuditLogger";
import { ConfigStateMachine, type ConfigLifecycleState } from "./configStateMachine";
import { ConfigBlacklist } from "./configBlacklist";
import { createIntegrityProvider, type IntegrityProvider } from "./integrityProvider";

const log = createLogger("scannerConfigurationManager");

export interface ConfigurationMetadata {
  version: number;
  schemaVersion: number;
  checksum: string;
  minimumAppVersion: string;
  updatedAt: string;
  // Signature fields
  signature?: string;
  signerId?: string;
  signatureAlgorithm?: string;
  signedAt?: string;
  keyId?: string;
  expiresAt?: string;
  // Configuration identity
  configurationId?: string;
  appliedAt?: string;
  activatedAt?: string;
  // Rollout metadata
  deploymentId?: string;
  rolloutGroup?: string;
  rolloutPercentage?: number;
}

export interface ScannerRankingPolicy {
  workflowWeight: number;
  confidenceWeight: number;
  roiWeight: number;
  areaWeight: number;
}

export interface HealthThresholds {
  maxStartupTimeMs: number;
  maxLatencyMs: number;
  maxDroppedFramesPercent: number;
  maxMemoryGrowthPercent: number;
}

export interface ScannerConfiguration {
  profiles: Record<string, Partial<ScannerProfile>>;
  rankingPolicies: Record<string, ScannerRankingPolicy>;
  featureFlags: {
    adaptiveROI: boolean;
    adaptiveLearning: boolean;
    aiQualityAnalyzer: boolean;
    gs1ParserV2: boolean;
    experimentalAutofocus: boolean;
    advancedRanking: boolean;
    telemetryEnabled: boolean;
  };
  telemetry: {
    analyticsEnabled: boolean;
    errorReportingEnabled: boolean;
  };
  rollout: {
    percentage: number;
  };
  constraints: {
    minOsVersion: string;
    requireHighPerformance: boolean;
  };
  healthThresholds?: HealthThresholds;
  rollbackCooldownMinutes?: number;
}

export interface ScannerConfigResponse {
  metadata: ConfigurationMetadata;
  configuration: ScannerConfiguration;
}

const CONFIG_CACHE_KEY = "scanner_config_response_cache";
const PREV_CONFIG_CACHE_KEY = "scanner_config_previous_cache";
const ETAG_CACHE_KEY = "scanner_configuration_etag";

// The hardcoded defaults are now ONLY stored as a preset mapping, not leaked into engine logic
export const RANKING_PRESETS: Record<string, ScannerRankingPolicy> = {
  default: { workflowWeight: 40, confidenceWeight: 30, roiWeight: 20, areaWeight: 10 },
  retail: { workflowWeight: 20, confidenceWeight: 50, roiWeight: 10, areaWeight: 20 },
  qr: { workflowWeight: 50, confidenceWeight: 20, roiWeight: 20, areaWeight: 10 },
  serial: { workflowWeight: 60, confidenceWeight: 30, roiWeight: 10, areaWeight: 0 },
};

export type ConfigSubscription = (config: ScannerConfiguration) => void;

/**
 * ScannerConfigurationManager
 * 
 * Enforces the strict configuration precedence order:
 * 1. Bundled JSON (fallback default)
 * 2. MMKV Cache (persisted configuration)
 * 3. Remote Configuration (fetched via ETag conditionally)
 * 4. Runtime Override (session specific)
 * 
 * Feature flags must be accessed exclusively through this manager.
 */
export class ScannerConfigurationManager {
  private configResponse: ScannerConfigResponse;
  private subscribers: Set<ConfigSubscription> = new Set();
  private stateMachine = new ConfigStateMachine();
  private blacklist = ConfigBlacklist.getInstance();
  private integrityProvider: IntegrityProvider = createIntegrityProvider();
  
  // Note: App version in a real app would come from expo-constants or package.json
  private currentAppVersion = "2.6.0";

  /** Max acceptable clock skew between client and server (5 minutes). */
  private static readonly MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

  constructor() {
    this.configResponse = this.loadConfiguration();
  }

  public getLifecycleState(): ConfigLifecycleState {
    return this.stateMachine.state;
  }

  public getLifecycleHistory() {
    return this.stateMachine.history;
  }

  private loadConfiguration(): ScannerConfigResponse {
    try {
      const cached = mmkvStorage.getItem(CONFIG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as ScannerConfigResponse;
        if (this.isValidConfiguration(parsed)) {
          // Additional version check over bundled
          const bundled = bundledConfigResponse as unknown as ScannerConfigResponse;
          if (parsed.metadata.version >= bundled.metadata.version) {
            log.info("Loaded scanner configuration from cache", { version: parsed.metadata.version });
            return parsed;
          }
        }
      }
    } catch (e) {
      log.warn("Failed to parse cached configuration, falling back to default", e);
    }
    
    // Fallback to bundled default
    log.info("Loaded default scanner configuration");
    return bundledConfigResponse as unknown as ScannerConfigResponse;
  }

  private isValidConfiguration(data: any): data is ScannerConfigResponse {
    if (!data || !data.metadata || !data.configuration) return false;
    
    // Schema validation (minimal)
    if (typeof data.metadata.version !== "number") return false;
    if (typeof data.metadata.schemaVersion !== "number") return false;
    if (data.metadata.schemaVersion !== 1) return false; // Unsupported schema
    
    // App version validation
    const minAppVersion = data.metadata.minimumAppVersion || "0.0.0";
    if (this.currentAppVersion < minAppVersion) {
      ScannerAuditLogger.getInstance().logEvent("VALIDATION_FAILED", data.metadata.version, `Min version: ${minAppVersion}`);
      return false;
    }

    // Checksum validation
    if (!data.metadata.checksum || data.metadata.checksum.length === 0) {
      ScannerAuditLogger.getInstance().logEvent("VALIDATION_FAILED", data.metadata.version, "Missing checksum");
      return false;
    }
    
    // In v2.6.1, we require signatures
    if (data.metadata.signatureAlgorithm && data.metadata.signatureAlgorithm !== "Ed25519") {
      log.error("Unsupported signature algorithm", { alg: data.metadata.signatureAlgorithm });
      return false;
    }
    
    // Strict signature checks would happen in SignatureVerifier, but basic presence check here:
    // (If signature fields are present, they must be strings)
    if (data.metadata.signature && typeof data.metadata.signature !== "string") return false;

    return true;
  }

  /**
   * Subscribes to configuration updates. Returns an unsubscribe function.
   */
  public subscribe(callback: ConfigSubscription): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    const config = this.getConfiguration();
    this.subscribers.forEach((callback) => {
      try {
        callback(config);
      } catch (e) {
        log.error("Error in configuration subscriber", e);
      }
    });
  }

  /**
   * Persists a new configuration to cache
   */
  public updateConfiguration(newConfigResponse: ScannerConfigResponse, etag?: string): void {
    try {
      if (newConfigResponse.metadata.version > this.configResponse.metadata.version) {
        // Backup current as previous
        mmkvStorage.setItem(PREV_CONFIG_CACHE_KEY, JSON.stringify(this.configResponse));
        
        mmkvStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(newConfigResponse));
        if (etag) {
          mmkvStorage.setItem(ETAG_CACHE_KEY, etag);
        }
        this.configResponse = newConfigResponse;
        this.notifySubscribers();
        log.info("Scanner configuration updated", { version: newConfigResponse.metadata.version });
        ScannerAuditLogger.getInstance().logEvent("CONFIG_APPLIED", newConfigResponse.metadata.version, "Configuration applied successfully.");
      }
    } catch (e) {
      log.error("Failed to update scanner configuration", e);
    }
  }

  /**
   * Reverts to the previous known good configuration (rollback)
   */
  public rollback(): boolean {
    log.warn("Initiating configuration rollback");
    try {
      const prevCached = mmkvStorage.getItem(PREV_CONFIG_CACHE_KEY);
      if (prevCached) {
        const prevConfig = JSON.parse(prevCached) as ScannerConfigResponse;
        
        // Restore to main cache
        mmkvStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(prevConfig));
        // Clear previous cache to prevent rolling back multiple times into oblivion
        mmkvStorage.removeItem(PREV_CONFIG_CACHE_KEY);
        
        this.configResponse = prevConfig;
        this.notifySubscribers();
        log.info("Configuration rollback successful", { version: prevConfig.metadata.version });
        ScannerAuditLogger.getInstance().logEvent("ROLLBACK_TRIGGERED", prevConfig.metadata.version, "Rolled back to previous known good configuration");
        return true;
      } else {
        log.error("No previous configuration found for rollback");
        return false;
      }
    } catch (e) {
      log.error("Failed to execute rollback", e);
      return false;
    }
  }

  /**
   * Fetches remote configuration with:
   *   - State machine lifecycle tracking
   *   - Blacklist rejection
   *   - IntegrityProvider token injection
   *   - Ed25519 signature + expiry validation
   *   - ETag conditional fetch
   *   - Exponential backoff with jitter
   */
  public async fetchRemoteConfiguration(attempt = 0): Promise<void> {
    try {
      const url = `${getBackendURL()}/api/v1/scanner/config`;
      const cachedEtag = mmkvStorage.getItem(ETAG_CACHE_KEY);
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      
      if (cachedEtag) {
        headers["If-None-Match"] = `"${cachedEtag}"`;
      }

      // Inject platform attestation token if available
      const integrityToken = await this.integrityProvider.getToken(url);
      if (integrityToken) {
        headers[integrityToken.headerName] = integrityToken.token;
      }
      
      const response = await fetch(url, { headers });
      
      if (response.status === 304) {
        log.info("Remote configuration unchanged (304 Not Modified)");
        return;
      }
      
      if (response.ok) {
        const rawJson = await response.json();

        // ── State: DOWNLOADED ──
        this.stateMachine.reset();
        this.stateMachine.transition("DOWNLOADED");
        
        // ── Blacklist check ──
        const configId = rawJson?.metadata?.configurationId;
        if (configId && this.blacklist.isBlacklisted(configId)) {
          const entry = this.blacklist.getEntry(configId);
          log.warn("Configuration is blacklisted, skipping", { configId, reason: entry?.reason });
          ScannerAuditLogger.getInstance().logEvent("BLACKLISTED", rawJson.metadata.version, `Blacklisted: ${entry?.reason}`);
          return;
        }

        // ── State: VERIFIED (schema/integrity) ──
        if (!this.isValidConfiguration(rawJson)) {
          log.warn("Fetched configuration failed strict validation.");
          ScannerAuditLogger.getInstance().logEvent("VALIDATION_FAILED", rawJson?.metadata?.version || 0, "Failed synchronous schema/integrity validation");
          return;
        }
        this.stateMachine.transition("VERIFIED");

        // ── State: SIGNATURE_VALIDATED ──
        const isSignatureValid = await SignatureVerifier.verifyConfiguration(rawJson);
        if (!isSignatureValid) {
          log.error("Configuration rejected due to invalid signature.");
          ScannerAuditLogger.getInstance().logEvent("SIGNATURE_FAILED", rawJson.metadata.version, "Ed25519 signature verification failed");
          return;
        }

        // Expiry check
        if (rawJson.metadata.expiresAt) {
          const expiresAtMs = new Date(rawJson.metadata.expiresAt).getTime();
          const now = Date.now();
          if (expiresAtMs < now) {
            log.error("Configuration signature has expired.", { expiresAt: rawJson.metadata.expiresAt });
            ScannerAuditLogger.getInstance().logEvent("SIGNATURE_EXPIRED", rawJson.metadata.version, `Expired at: ${rawJson.metadata.expiresAt}`);
            return;
          }
        }

        // Clock-skew check on signedAt
        if (rawJson.metadata.signedAt) {
          const signedAtMs = new Date(rawJson.metadata.signedAt).getTime();
          if (signedAtMs > Date.now() + ScannerConfigurationManager.MAX_CLOCK_SKEW_MS) {
            log.error("Configuration signedAt is in the future beyond acceptable skew.");
            ScannerAuditLogger.getInstance().logEvent("VALIDATION_FAILED", rawJson.metadata.version, "signedAt future timestamp rejected");
            return;
          }
        }

        this.stateMachine.transition("SIGNATURE_VALIDATED");

        // ── State: STAGED ──
        if (rawJson.metadata.version > this.configResponse.metadata.version) {
          this.stateMachine.transition("STAGED");
          const newEtag = response.headers.get("ETag")?.replace(/"/g, '') || rawJson.metadata.checksum;
          // Apply transactionally — updateConfiguration backs up previous first
          this.updateConfiguration(rawJson, newEtag);
          // State transitions to HEALTH_CHECK / ACTIVE are handled by ScannerEngine subscriber
        } else {
          log.info("Fetched configuration is not newer than current.", { version: rawJson.metadata.version });
          if (rawJson.metadata.version < this.configResponse.metadata.version) {
            ScannerAuditLogger.getInstance().logEvent("DOWNGRADE_REJECTED", rawJson.metadata.version, "Attempted to downgrade configuration");
          }
        }
      } else {
        log.warn("Failed to fetch remote configuration", { status: response.status });
        this.scheduleRetry(attempt);
      }
    } catch (e) {
      log.warn("Network error fetching configuration (Offline mode active)", e);
      this.scheduleRetry(attempt);
    }
  }

  /**
   * Called by ScannerEngine when the health check passes.
   */
  public markActive(): void {
    try {
      this.stateMachine.transition("HEALTH_CHECK");
      this.stateMachine.transition("ACTIVE");
    } catch {
      // State machine may not be in STAGED if this was a cached load
    }
  }

  /**
   * Called by ScannerEngine when the health check fails.
   * Triggers blacklisting and rollback.
   */
  public markHealthCheckFailed(reason: string): void {
    try {
      this.stateMachine.transition("HEALTH_CHECK");
      this.stateMachine.transition("HEALTH_CHECK_FAILED");
      this.stateMachine.transition("ROLLBACK");

      const configId = this.configResponse.metadata.configurationId;
      if (configId) {
        const cooldown = this.configResponse.configuration.rollbackCooldownMinutes;
        this.blacklist.blacklist(configId, reason, cooldown);
        this.stateMachine.transition("BLACKLISTED");
        ScannerAuditLogger.getInstance().logEvent("HEALTH_CHECK_FAILED", this.configResponse.metadata.version, reason);
      }

      this.rollback();
      this.stateMachine.transition("PREVIOUS_ACTIVE");
    } catch (e) {
      log.error("Error during health-check failure handling", e);
      this.rollback();
    }
  }

  private scheduleRetry(attempt: number) {
    if (attempt >= 5) return;
    const baseDelay = Math.min(60000, 5000 * Math.pow(2, attempt));
    const jitter = Math.random() * 1000;
    const finalDelay = baseDelay + jitter;
    setTimeout(() => {
      this.fetchRemoteConfiguration(attempt + 1);
    }, finalDelay);
  }

  public getHealthThresholds(): HealthThresholds {
    return this.configResponse.configuration.healthThresholds ?? {
      maxStartupTimeMs: 2000,
      maxLatencyMs: 300,
      maxDroppedFramesPercent: 5,
      maxMemoryGrowthPercent: 10,
    };
  }

  public getConfiguration(): ScannerConfiguration {
    return this.configResponse.configuration;
  }
  
  public getMetadata(): ConfigurationMetadata {
    return this.configResponse.metadata;
  }

  public getRankingPolicy(workflowId: string = "default"): ScannerRankingPolicy {
    const policy = this.getConfiguration().rankingPolicies?.[workflowId];
    if (policy) return policy as ScannerRankingPolicy;
    
    // Check preset
    if (RANKING_PRESETS[workflowId]) {
      return RANKING_PRESETS[workflowId] as ScannerRankingPolicy;
    }
    
    // strict fallback
    return RANKING_PRESETS["default"] as ScannerRankingPolicy;
  }

  public getProfileOverrides(profileType: ScannerProfileType): Partial<ScannerProfile> | undefined {
    return this.getConfiguration().profiles?.[profileType];
  }

  public getFeatureFlags() {
    return this.getConfiguration().featureFlags;
  }
}
