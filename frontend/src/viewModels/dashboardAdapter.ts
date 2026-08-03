/**
 * Dashboard adapter — KPI tiles & exception triage (P3 / OXS §6.5, proposal §7.1).
 *
 * Maps backend metric/exception DTOs to {@link DashboardKpiViewModel} and
 * {@link ExceptionTriageItem}. The adapter performs PRESENTATION formatting
 * (compact notation, currency/percent suffixes, trend-direction inference) but
 * NEVER recomputes authoritative business truth — it only formats values the
 * backend already computed. Absent values surface as `isAbsent` (rendered "—"),
 * never coerced to zero (CI-01).
 */

import type {
  DashboardKpiViewModel,
  DashboardLink,
  DashboardStatus,
  ExceptionTriageItem,
  ExceptionTriageKind,
  KpiKind,
  KpiTrend,
  KpiTrendDirection,
  TriageSeverity,
} from "./types";

// ---------------------------------------------------------------------------
// DTOs (loose backend shapes)
// ---------------------------------------------------------------------------

export type KpiUnit = "count" | "currency" | "percent";

export interface KpiMetricDTO {
  kind: KpiKind;
  /** Raw authoritative value from the backend. `null` = genuinely absent. */
  value: number | null;
  /** Display label, e.g. "Verified Value". */
  label: string;
  unit?: KpiUnit;
  /** Prior-period value for trend inference. Omitted ⇒ no trend. */
  priorValue?: number | null;
  status?: DashboardStatus;
  linkTo?: DashboardLink;
}

export interface ExceptionDTO {
  kind: ExceptionTriageKind;
  count: number;
  /** Optional override title/description; defaults derived from `kind`. */
  title?: string;
  description?: string;
  severity?: TriageSeverity;
  linkTo?: DashboardLink;
}

// ---------------------------------------------------------------------------
// Formatting helpers (presentation only — no recomputation)
// ---------------------------------------------------------------------------

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Compact INR-friendly notation: ≥1,00,000 (1 lakh) → "X.XL", ≥1000 → "X.XK". */
export const formatCompact = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs}`;
};

/** Formats a value for its unit. Returns "—" for absence. */
export const formatKpiValue = (value: number | null, unit: KpiUnit = "count"): string => {
  if (!isFiniteNumber(value)) return "—";
  switch (unit) {
    case "currency":
      return `₹${formatCompact(value)}`;
    case "percent":
      return `${value.toFixed(0)}%`;
    case "count":
    default:
      return formatCompact(value);
  }
};

const inferTrendDirection = (delta: number): KpiTrendDirection => {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Maps a metric DTO to a big-numeric KPI view model. Infers trend direction from
 * the delta but does NOT decide whether the trend is "good" (that is a domain
 * judgement surfaced via `status` by the caller/backend).
 */
export const toDashboardKpiViewModel = (dto: KpiMetricDTO): DashboardKpiViewModel => {
  const isAbsent = !isFiniteNumber(dto.value);
  const displayValue = formatKpiValue(dto.value, dto.unit);

  let trend: KpiTrend | undefined;
  if (isFiniteNumber(dto.priorValue) && isFiniteNumber(dto.value)) {
    const delta = dto.value - dto.priorValue;
    trend = { delta, direction: inferTrendDirection(delta) };
  }

  return {
    kind: dto.kind,
    displayValue,
    label: dto.label,
    trend,
    status: dto.status ?? "primary",
    linkTo: dto.linkTo,
    isAbsent,
  };
};

const DEFAULT_EXCEPTION_COPY: Record<
  ExceptionTriageKind,
  { title: string; description: string; severity: TriageSeverity }
> = {
  failed_sync: {
    title: "Failed syncs",
    description: "Submissions that failed to reach the server and need retry.",
    severity: "critical",
  },
  high_variance: {
    title: "High variance",
    description: "Items exceeding the variance threshold awaiting review.",
    severity: "high",
  },
  stuck_session: {
    title: "Stuck sessions",
    description: "Sessions with no activity past the inactivity window.",
    severity: "high",
  },
  overdue_recount: {
    title: "Overdue recounts",
    description: "Assigned recounts past their due window.",
    severity: "medium",
  },
  rejected_submission: {
    title: "Rejected submissions",
    description: "Submissions rejected in review requiring correction.",
    severity: "high",
  },
};

/** Maps an exception DTO to a triage row, filling defaults from the kind. */
export const toExceptionTriageItem = (dto: ExceptionDTO): ExceptionTriageItem => {
  const defaults = DEFAULT_EXCEPTION_COPY[dto.kind];
  return {
    kind: dto.kind,
    title: dto.title?.trim() || defaults.title,
    description: dto.description?.trim() || defaults.description,
    count: Math.max(0, Math.floor(dto.count)),
    severity: dto.severity ?? defaults.severity,
    linkTo: dto.linkTo,
  };
};
