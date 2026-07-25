/**
 * Stock Verify v2.6.2 — Configuration Blacklist
 *
 * Prevents endless rollback loops by blacklisting configurations
 * that failed health checks. A blacklisted configurationId is
 * rejected for `rollbackCooldownMinutes` (default 30, remotely configurable,
 * max 1440 = 24 hours).
 *
 * Each blacklist entry stores:
 *   configurationId, reason, failedAt, retryAfter
 */

import { mmkvStorage } from "../mmkvStorage";
import { createLogger } from "../logging";

const log = createLogger("configBlacklist");

const BLACKLIST_KEY = "scanner_config_blacklist";

/** Default cooldown in minutes. Can be overridden by remote configuration. */
const DEFAULT_COOLDOWN_MINUTES = 30;
const MAX_COOLDOWN_MINUTES = 1440; // 24 hours

export interface ConfigBlacklistEntry {
  configurationId: string;
  reason: string;
  failedAt: number;    // epoch ms
  retryAfter: number;  // epoch ms
}

export class ConfigBlacklist {
  private static instance: ConfigBlacklist;

  private entries: ConfigBlacklistEntry[] = [];

  private constructor() {
    this.load();
  }

  public static getInstance(): ConfigBlacklist {
    if (!ConfigBlacklist.instance) {
      ConfigBlacklist.instance = new ConfigBlacklist();
    }
    return ConfigBlacklist.instance;
  }

  private load(): void {
    try {
      const raw = mmkvStorage.getItem(BLACKLIST_KEY);
      if (raw) {
        this.entries = JSON.parse(raw) as ConfigBlacklistEntry[];
      }
    } catch {
      this.entries = [];
    }
  }

  private persist(): void {
    mmkvStorage.setItem(BLACKLIST_KEY, JSON.stringify(this.entries));
  }

  /**
   * Returns the effective cooldown in minutes, clamped to MAX.
   */
  private getEffectiveCooldown(remoteCooldownMinutes?: number): number {
    const minutes = remoteCooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES;
    return Math.min(Math.max(1, minutes), MAX_COOLDOWN_MINUTES);
  }

  /**
   * Blacklists a configuration. It will be rejected until `retryAfter`.
   */
  public blacklist(
    configurationId: string,
    reason: string,
    remoteCooldownMinutes?: number
  ): void {
    const cooldownMs = this.getEffectiveCooldown(remoteCooldownMinutes) * 60 * 1000;
    const now = Date.now();

    // Remove any existing entry for this id (replace)
    this.entries = this.entries.filter((e) => e.configurationId !== configurationId);

    this.entries.push({
      configurationId,
      reason,
      failedAt: now,
      retryAfter: now + cooldownMs,
    });

    this.persist();
    log.warn("Configuration blacklisted", { configurationId, reason, cooldownMs });
  }

  /**
   * Returns true if the configuration is currently blacklisted.
   */
  public isBlacklisted(configurationId: string): boolean {
    const now = Date.now();
    // Prune expired entries opportunistically
    this.entries = this.entries.filter((e) => e.retryAfter > now);
    this.persist();

    return this.entries.some((e) => e.configurationId === configurationId);
  }

  /**
   * Returns the blacklist entry for diagnostics, or undefined.
   */
  public getEntry(configurationId: string): ConfigBlacklistEntry | undefined {
    return this.entries.find((e) => e.configurationId === configurationId);
  }

  /**
   * Returns all currently active blacklist entries.
   */
  public getAll(): ConfigBlacklistEntry[] {
    const now = Date.now();
    return this.entries.filter((e) => e.retryAfter > now);
  }
}
