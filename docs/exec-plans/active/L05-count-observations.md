# Count Observations Execution Plan

## Goal
Introduction of append-only physical observation contracts replacing mutable count-line documents.

## Loop Status
PENDING

## Dependencies
- L04 must be complete (tracking policy defines the observation structure)

## Execution Steps
1. Add count_observation collection
2. Define observation sub-documents: quantity_observation, physical_batch, serial_unit, condition_allocation, evidence, exception
3. Make submitted observations immutable
4. Implement versioning for corrections
5. Implement lineage for recounts
6. Keep count_lines as compatibility projection
7. Write migration projection script
8. Write unit and integration tests

## Verification
- Submitted observations are immutable
- Corrections create new versions
- Recount creates new lineage records
- Previous records are marked superseded but retained