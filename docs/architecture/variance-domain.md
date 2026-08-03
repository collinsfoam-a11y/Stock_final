# Variance Domain Architecture

## Overview

The variance domain establishes clear ERP truth without mislabelling cached data. It computes both audit and operational deltas at the enterprise level.

## Three Quantity References

### 1. Frozen Baseline

ERP quantity when the master session starts:
- `baseline_qty`
- `baseline_at`
- `snapshot_version`

### 2. SQL Quantity at Submission

Direct SQL result when the employee submits the physical count:
- `sql_qty_at_submission`
- `sql_fetched_at`
- `sql_source`
- `sql_query_version`

### 3. Physical Observation

The actual quantity counted at the selected location:
- `physical_qty`
- `location_session_id`
- `observed_at`
- `observed_by`

## Quantity Delta Calculation

```
quantity_delta = physical_qty - expected_qty
```

- Negative = shortage
- Positive = excess
- Zero = matched

Explicit fields:
```
shortage_qty = max(expected - physical, 0)
excess_qty   = max(physical - expected, 0)
```

## Enterprise-Level Final Variance

A location count is only one physical component. The final result aggregates accepted counts from every location session.

### Audit Delta
```
total_physical_qty = sum(accepted physical counts across all location sessions)
audit_delta = total_physical_qty - frozen_baseline
```

### Operational Delta
```
operational_delta = total_physical_qty - movement_adjusted_expected_quantity
```

Internal relocation between two counted locations does not change enterprise expected stock. External receipts, sales, dispatches, and adjustments after the snapshot change operational expected stock.

## SQL-at-Submission Flow

1. Staff presses Review/Submit
2. Physical observation persisted locally
3. Attempt live SQL quantity fetch
4. SQL available → store SQL snapshot and calculate provisional delta
5. SQL unavailable → status `PENDING_SQL_VALIDATION`

Stored fields:
- `baseline_qty`
- `baseline_at`
- `sql_qty_at_submission`
- `sql_fetched_at`
- `sql_fetch_status`
- `sql_source`
- `physical_qty`
- `provisional_delta`
- `validation_status`

## Shortage Investigation

For negative quantity delta, capture:
- Known/suspected location
- Observed or estimated quantity
- Confidence level
- Mandatory remark
- Optional evidence

Creates a linked location-verification task.