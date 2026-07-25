import { getBackendURL } from "../backendUrl";
import { getDeviceId } from "../deviceId";
import { createLogger } from "../logging";
import { ConfigurationAuditLog } from "../device/configurationAuditLog";

const log = createLogger("scannerAnalytics");

export interface ScanMetricEvent {
  eventId: string;
  sessionId?: string;
  profileType: string;
  scanDurationMs: number;
  decodeDurationMs: number;
  roiWidthRatio: number;
  symbology?: string;
  success: boolean;
  retryCount: number;
  lightingLevel?: "low" | "optimal" | "glare";
  deviceModel?: string;
  timestamp: number;
}

export interface ReplayMetadataV1 {
  timestamp: number;
  runtime: {
    batteryLevel?: number;
    thermalState?: string;
    droppedFrames?: number;
  };
  scanner: {
    latencyMs: number;
    decoderConfidence: number;
    retries: number;
    symbology: string;
    roiSize: Record<string, number>;
    blurScore: number;
    brightness: number;
  };
  device: {
    profile: string;
    tier?: string;
    configVersion: number;
  };
  result: "SUCCESS" | "FAILED" | "DISCARDED" | "TIMEOUT" | "DUPLICATE";
}

export interface FleetAggregatedMetrics {
  totalScans: number;
  successRate: number; // percentage 0-100
  avgScanDurationMs: number;
  avgDecodeDurationMs: number;
  topSymbology: string;
  retryRate: number;
}

export class ScannerAnalytics {
  private static instance: ScannerAnalytics;
  private metricsBuffer: ScanMetricEvent[] = [];
  private replayBuffer: ReplayMetadataV1[] = [];
  private telemetryEnabled: boolean = true;

  public static getInstance(): ScannerAnalytics {
    if (!ScannerAnalytics.instance) {
      ScannerAnalytics.instance = new ScannerAnalytics();
    }
    return ScannerAnalytics.instance;
  }

  public setTelemetryEnabled(enabled: boolean) {
    this.telemetryEnabled = enabled;
  }

  public recordScan(event: Omit<ScanMetricEvent, "eventId" | "timestamp">): void {
    if (!this.telemetryEnabled) return;

    const fullEvent: ScanMetricEvent = {
      ...event,
      eventId: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    this.metricsBuffer.push(fullEvent);
    if (this.metricsBuffer.length > 500) {
      this.metricsBuffer.shift(); // keep sliding buffer of 500 scans
    }
  }

  public recordReplay(replay: ReplayMetadataV1): void {
    if (!this.telemetryEnabled) return;
    
    this.replayBuffer.push(replay);
    if (this.replayBuffer.length > 100) {
      this.replayBuffer.shift();
    }
  }

  public getAggregatedMetrics(): FleetAggregatedMetrics {
    if (this.metricsBuffer.length === 0) {
      return {
        totalScans: 0,
        successRate: 100,
        avgScanDurationMs: 0,
        avgDecodeDurationMs: 0,
        topSymbology: "none",
        retryRate: 0,
      };
    }

    const totalScans = this.metricsBuffer.length;
    const successfulScans = this.metricsBuffer.filter((e) => e.success).length;
    const retries = this.metricsBuffer.filter((e) => e.retryCount > 0).length;

    const totalScanDuration = this.metricsBuffer.reduce((sum, e) => sum + e.scanDurationMs, 0);
    const totalDecodeDuration = this.metricsBuffer.reduce((sum, e) => sum + e.decodeDurationMs, 0);

    const symbologyCounts: Record<string, number> = {};
    for (const e of this.metricsBuffer) {
      const sym = e.symbology || "unknown";
      symbologyCounts[sym] = (symbologyCounts[sym] || 0) + 1;
    }

    let topSymbology = "code-128";
    let maxCount = 0;
    for (const [sym, count] of Object.entries(symbologyCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topSymbology = sym;
      }
    }

    return {
      totalScans,
      successRate: Math.round((successfulScans / totalScans) * 100),
      avgScanDurationMs: Math.round(totalScanDuration / totalScans),
      avgDecodeDurationMs: Math.round(totalDecodeDuration / totalScans),
      topSymbology,
      retryRate: Math.round((retries / totalScans) * 100),
    };
  }

  public async uploadBatch(appVersion: string, configurationVersion: number): Promise<void> {
    if (!this.telemetryEnabled || (this.metricsBuffer.length === 0 && this.replayBuffer.length === 0)) {
      return;
    }

    const replaysBatch = [...this.replayBuffer];
    const metricsBatch = [...this.metricsBuffer];
    this.clearBuffer();

    try {
      const deviceId = await getDeviceId();
      const url = `${getBackendURL()}/api/v1/scanner/analytics/batch`;
      
      const auditLogAggregates = await ConfigurationAuditLog.getInstance().getAggregatedMetrics();

      const payload = {
        deviceId,
        appVersion,
        configurationVersion,
        timestamp: new Date().toISOString(),
        metrics: metricsBatch,
        replays: replaysBatch,
        auditLogs: auditLogAggregates
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        log.info(`Flushed ${replaysBatch.length} replay events and aggregated audit logs`);
      } else {
        log.warn("Failed to flush replays. Adding back to buffer", { status: response.status });
        this.replayBuffer.unshift(...replaysBatch);
        this.metricsBuffer.unshift(...metricsBatch);
      }
    } catch (e) {
      log.warn("Network error flushing replays", e);
      this.replayBuffer.unshift(...replaysBatch);
      this.metricsBuffer.unshift(...metricsBatch);
    }
  }

  public clearBuffer(): void {
    this.metricsBuffer = [];
    this.replayBuffer = [];
  }
}
