# Counting Domain Architecture

## Overview

The counting domain handles physical stock observations with backend-controlled tracking policies, append-only observation models, and structured batch/serial/bundle support.

## Item Policy Snapshot

Stored with every count observation:

```json
{
  "policy_version": "2026.07.1",
  "item_version": "SQL-187239",
  "tracking_mode": "BATCH",
  "quantity_precision": 0,
  "base_uom": "NOS",
  "allows_fraction": false,
  "requires_mfg_date": false,
  "requires_expiry_date": true,
  "allowed_conditions": ["SALEABLE", "DAMAGED", "EXPIRED"],
  "evidence_rules": {}
}
```

## Tracking Modes

- **QUANTITY** — Simple quantity count, no batch/serial details
- **BATCH** — Count by physical batch with ERP batch number, MRP, and dates
- **SERIAL** — Count individual serial units with condition tracking
- **BUNDLE** — Count existing or proposed bundles with component validation

## Quantity Rules

- Physical 0 is valid (confirms complete shortage)
- Negative quantities are rejected
- Item remark is mandatory
- UOM precision is enforced in the backend
- Serial item quantity equals accepted serial count
- Split count is structured (carton/loose lines with explicit total)

## Observation Model

Submitted observations are immutable. Corrections create a new version. Recount creates a new lineage record. Previous records are marked superseded but retained.

### Observation Structure

```
count_observation
├── quantity_observation
├── physical_batch[]
├── serial_unit[]
├── condition_allocation[]
├── evidence[]
└── exception[]
```

## Physical Batch Identity

- `item_code` + physical batch number + MRP + manufacturing date + expiry date
- Different MRP creates a separate physical batch even when ERP batch number is the same or missing

## Serial Unit Tracking

Each serial unit stores:
- Serial number
- Item code
- MRP
- Manufacturing date
- Expiry date
- Condition
- Damage type
- Returnability
- Repairability
- Photos
- Location
- Observation ID

Serial uniqueness is global within the master session. Duplicate serials are quarantined—never merged.

## Internal Barcode

Server-governed sequence (e.g., `500100000001`). Controls include:
- Check digit where applicable
- Uniqueness
- Proposal state
- Supervisor approval
- Activation state
- Source bundle/batch reference
- No staff-selected next number