/**
 * Stock Verify v2.6.2 — Configuration Lifecycle State Machine
 *
 * Tracks explicit lifecycle states for each configuration:
 *   DOWNLOADED → VERIFIED → SIGNATURE_VALIDATED → STAGED → HEALTH_CHECK → ACTIVE
 *
 * Failure path:
 *   HEALTH_CHECK_FAILED → ROLLBACK → BLACKLISTED → PREVIOUS_ACTIVE
 */

export type ConfigLifecycleState =
  | "IDLE"
  | "DOWNLOADED"
  | "VERIFIED"
  | "SIGNATURE_VALIDATED"
  | "STAGED"
  | "HEALTH_CHECK"
  | "ACTIVE"
  | "HEALTH_CHECK_FAILED"
  | "ROLLBACK"
  | "BLACKLISTED"
  | "PREVIOUS_ACTIVE";

/**
 * Valid state transitions.
 * Each key maps to the set of states it can transition into.
 */
const VALID_TRANSITIONS: Record<ConfigLifecycleState, ConfigLifecycleState[]> = {
  IDLE: ["DOWNLOADED"],
  DOWNLOADED: ["VERIFIED"],
  VERIFIED: ["SIGNATURE_VALIDATED"],
  SIGNATURE_VALIDATED: ["STAGED"],
  STAGED: ["HEALTH_CHECK"],
  HEALTH_CHECK: ["ACTIVE", "HEALTH_CHECK_FAILED"],
  ACTIVE: ["DOWNLOADED"], // can restart the cycle on next fetch
  HEALTH_CHECK_FAILED: ["ROLLBACK"],
  ROLLBACK: ["BLACKLISTED", "PREVIOUS_ACTIVE"],
  BLACKLISTED: ["PREVIOUS_ACTIVE"],
  PREVIOUS_ACTIVE: ["DOWNLOADED"], // can restart on next fetch
};

export class ConfigStateMachine {
  private _state: ConfigLifecycleState = "IDLE";
  private _history: Array<{ from: ConfigLifecycleState; to: ConfigLifecycleState; at: number }> = [];

  public get state(): ConfigLifecycleState {
    return this._state;
  }

  public get history() {
    return [...this._history];
  }

  /**
   * Transitions to a new state.
   * Throws if the transition is invalid.
   */
  public transition(to: ConfigLifecycleState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${to}. Allowed: [${allowed?.join(", ") ?? "none"}]`
      );
    }
    this._history.push({ from: this._state, to, at: Date.now() });
    this._state = to;
  }

  /**
   * Resets the machine to IDLE.
   * Used only on app startup or after a complete cycle.
   */
  public reset(): void {
    this._state = "IDLE";
    this._history = [];
  }
}
