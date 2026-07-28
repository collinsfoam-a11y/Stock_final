# API Compatibility Contracts

## Overview

Defines compatibility strategies for API changes during the migration from legacy count-lines to the new observation/event model.

## Compatibility Projection

### Read Endpoints

Existing read endpoints continue to work by projecting from the new `count_observation` model to the legacy shape:

| Legacy Field | New Source | Mapping |
|---|---|---|
| `count_lines[].quantity` | `count_observation.quantity_observation.quantity` | Direct |
| `count_lines[].item_code` | `count_observation.item_code` | Direct |
| `count_lines[].session_id` | `count_observation.location_session_id` | Direct |
| `count_lines[].batch_id` | `count_observation.physical_batch[].batch_id` | First batch |
| `count_lines[].serial_numbers` | `count_observation.serial_unit[].serial_number` | Array |
| `count_lines[].remark` | `count_observation.quantity_observation.remark` | Direct |

### Write Endpoints

| Endpoint | Legacy | New | Compatibility |
|---|---|---|---|
| POST /count-lines | Mutable count-line | Immutable observation | Legacy writes create observations with legacy projection |
| PUT /count-lines/{id} | Overwrite count-line | Create new version | Legacy update creates new observation version |
| DELETE /count-lines/{id} | Delete count-line | No deletion | Legacy delete marks observation as superseded |

## API Versioning

- API versioning uses header-based versioning: `X-API-Version`
- Current version: `2026.07`
- Legacy endpoints accept `X-API-Version: 2026.06` and earlier
- New endpoints default to the current version

## Deprecation Policy

1. Legacy endpoints are marked deprecated in API documentation.
2. Deprecated endpoints continue to function for a minimum of 6 months.
3. Deprecation warnings are returned in response headers.
4. Legacy endpoints are retired only after stable operation of new endpoints is confirmed.