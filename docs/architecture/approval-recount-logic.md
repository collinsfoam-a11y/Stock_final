# Revised Approval, Auto-Approval and Recount Logic

## Three Governance Levels

1. Staff Observation
2. System Validation / Auto-Approval
3. Supervisor Review, when required
4. Session Approval and Finalisation

## Auto-Approval Rules

An observation is automatically approved when ALL conditions are true:
- SQL quantity was successfully fetched at submission time
- Physical count equals submission-time SQL quantity
- No batch-wise variance
- No serial missing, duplicated, unknown or mapped to another item
- No MRP, barcode, manufacturing-date or expiry-date mismatch
- Physical location matches expected location (or no location policy)
- No damaged, expired, quarantine, opened-box or incomplete quantity
- No provisional batch, new bundle or unknown item created
- No additional-stock-location investigation pending
- Mandatory item remark completed
- Required parameters and accessory checks complete
- Required photos where policy demands them are available
- Local and server validations passed
- No concurrent observation or sync conflict

## SQL-Unavailable Auto-Approval

When SQL unavailable: status = AWAITING_SQL_VALIDATION
After reconnection: fetch SQL, calculate variance, run all approval rules, auto-approve only if all pass.

## Supervisor Approval Conditions

- Any shortage or excess
- Attribute mismatch despite zero quantity variance
- Additional stock in another location
- Location mismatch or relocation request
- Provisional or manually created batch
- Zero-stock ERP batch physically found
- Serial duplicate, unknown or wrong-item serial
- Damaged, expired, quarantine or incomplete stock
- Returnable/repairable/non-returnable classification
- Return approval or rejection
- Unknown item
- Provisional bundle
- Internally generated 500100... barcode
- Missing item tracking policy
- Low-confidence manual item selection
- Session takeover with conflicting observations
- Offline sync conflict
- Count modified after initial submission
- Recount result differing from original count
- Missing or inadequate evidence
- Unusually large quantity or variance per policy thresholds

## Recount Triggers

- Variance exceeds configured quantity or percentage limits
- High-value stock has any variance
- Serialized expected and physical differ
- Batch totals match but batch-wise distribution differs
- Same item has conflicting counts across locations
- Additional quantity elsewhere but not verified
- Split-count calculation unusual
- Manual item selection with low confidence
- Concurrent observation exists
- Required evidence unclear
- Original count used stale ERP info
- Session taken over after 1 hour inactivity

## Status Values

RECOUNT_REQUESTED, RECOUNT_ASSIGNED, RECOUNT_IN_PROGRESS, RECOUNT_SUBMITTED, RECOUNT_MATCHED, RECOUNT_DIFFERENCE, RECOUNT_APPROVED

## Blind Recount

- Different staff member normally
- Hides original physical count, variance, remark
- Shows item identity, location, tracking policy, batch/serial workflow
- New SQL snapshot at recount submission
- Original observation remains unchanged

## Session Statuses

DRAFT, OPEN, PAUSED, AUTO_RELEASED, SUBMITTED, PARTIALLY_AUTO_APPROVED, SUPERVISOR_REVIEW, RECOUNT_REQUIRED, APPROVED, COMPLETED, FINALISED, CANCELLED
