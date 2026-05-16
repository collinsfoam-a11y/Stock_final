# VARIANCE_ENGINE — Validation, Merge, Classification

## Reconciliation Phases
1. Session Validation: validate each session independently.
2. Cross-Session Merge: aggregate by `item + batch + serial + location`.
3. ERP Comparison: compare to frozen ERP snapshot captured at session start.
4. Variance Classification: classify cause and required action.

## Variance Classifications
- Operational movement
- Counting error
- Probable theft
- Damaged loss
- ERP mismatch
- Transfer timing issue

## Serialized Reconciliation
Compute and persist:
- missing serials
- duplicate serials
- moved serials
- unrecognized serials
- condition mismatches

## Escalation Triggers
- High variance % or value thresholds
- Serialized mismatches
- Expiry mismatches
- MRP mismatches
- Repeat counter anomaly patterns
