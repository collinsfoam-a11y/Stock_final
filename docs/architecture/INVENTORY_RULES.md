# INVENTORY_RULES — Enterprise Governance Baseline

## Inventory Uniqueness Key
Inventory identity is defined by:
- item
- location
- batch
- serial
- condition
- ownership
- inventory_state
- MRP
- expiry

Any reconciliation or variance logic must operate at this dimensional granularity.

## Inventory States
- Available
- Reserved
- Blocked
- Damaged
- Expired
- In Transit
- Under Verification
- Quarantined
- Scrap
- Customer Return
- Vendor Return
- Lost

## Quantity & UOM Rules
- Persist normalized quantities in base UOM.
- Reject fractions for NOS-style units.
- Use contract errors `FRACTION_NOT_ALLOWED` and `PRECISION_EXCEEDED`.
- Reject negative quantities.

## Validation Rules
- Reject expiry dates earlier than manufacture dates.
- Reject duplicate serials in the same item scope.
- Flag unknown serials and wrong-location serials for review.
- Route MRP mismatch to supervisor review.
- Escalate high-variance entries by policy.
