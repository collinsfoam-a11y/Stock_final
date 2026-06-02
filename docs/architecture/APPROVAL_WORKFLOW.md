# APPROVAL_WORKFLOW — Rules-Driven Governance

## Approval Matrix Inputs
- variance percentage
- variance value
- item category
- item risk level
- serial presence/mismatch
- expiry involvement
- damage presence
- location criticality
- user role

## Policy Engine Requirement
Approval routing must be policy-table/config driven; business logic must not hardcode static thresholds.

## Example Policy Outcomes
- Low variance, no serial mismatch, no damage → auto-approve.
- Any serialized variance → supervisor required.
- High-value variance over configured threshold → manager required.
- Expiry mismatch → QA review required.

## Role Model
- Counter
- Senior Counter
- Supervisor
- Auditor
- Warehouse Manager
- Admin
- Master Data Team
- Finance Reviewer
- QA Reviewer

## Governance Rules
- Counters cannot finalize inventory.
- Override approvals require mandatory remarks.
- Manual stock adjustments require full audit trail.
- Closed approvals are immutable; reopen creates versioned approval trail.
