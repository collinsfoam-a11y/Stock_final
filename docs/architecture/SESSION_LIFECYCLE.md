# SESSION_LIFECYCLE — Enterprise State & Concurrency Model

## Session State Machine
Draft
→ Scheduled
→ Assigned
→ Locked
→ In Progress
→ Paused
→ Sync Pending
→ Validation Pending
→ Pending Approval
→ Approved
→ Partially Approved
→ Recount Requested
→ Reopened
→ Closed
→ Archived

## Snapshot Immutability
At session start, freeze and version:
- inventory qty
- serial ownership
- batch state
- MRP
- expiry state
- location assignment
- item metadata version

All variance and approval comparisons must use this frozen snapshot, never live inventory.

## Concurrency & Locks
- Soft Lock: prevents accidental overlap.
- Hard Lock: supervisor-enforced exclusivity.
- Item-Level Lock: prevents duplicate serial counting in active sessions.
- Location Lock: prevents rack/zone overlap.
- Approval Lock: freezes session edits during review.

## Required Conflict Detection
- Same serial counted in another active session.
- Same rack counted simultaneously.
- Item transferred during count.
- ERP stock changed during session window.
- Batch mismatch across overlapping sessions.
- Duplicate offline submissions.
