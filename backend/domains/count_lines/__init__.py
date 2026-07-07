"""Count-line bounded context (BSR Part F: controlled clean-architecture
extraction).

Status: domain/ layer only, not wired into the running application.
backend/api/count_lines_routes.py and backend/services/
count_line_write_service.py remain the production code path unchanged.
See backend/domains/count_lines/tests/domain/test_semantic_identity_parity.py
for the proof this layer's identity/hash logic matches production exactly
for the fields production currently uses -- required before any future
wiring step, not yet done here.
"""
