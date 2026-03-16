# Fix Issues in App - Test & Lint Cleanup Plan

Status: In Progress

## Steps:

### 1. [COMPLETE] Kill stuck terminals if any

### 2. [COMPLETE] Backend Env Fixed

- .venv Python 3.11.14, deps incl crypto 46.0.5
- pytest runs 725 tests (some pass/fail - business logic issues noted for later)
- pip install -r backend/requirements.dev.txt

### 3. [COMPLETE] Fix Frontend Test 1: inventoryWorkflowApi.offlineCount.test.ts

- Fixed httpClient mock path to ../../httpClient
- Next authStore path fix pending test run

### 4. [PENDING] Fix Frontend Test 2: offlineStorage.queue.test.ts

- Fix AsyncStorage mock setup
- Fix dedupe expectation failure

### 5. [PENDING] Lint cleanup (post auto-fix)

- Fix test requires/unused vars
- Clean jest.setup.js

### 6. [PENDING] Verify Backend Tests Pass

- pytest tests/

### 7. [PENDING] Verify Frontend Tests 41/41 Pass

- npm test

### 8. [PENDING] Run Validation

- scripts/health_check_summary.py
- scripts/final_system_validation.sh

## Completion Criteria

- All tests pass (frontend 41/41, backend pytest success)
- 0 lint errors
- Health checks green
