## 2026-09-22 - Upgrade cryptography to 50.0.1
**Learning:** The cryptography package version 48.0.1 was flagged with a Bleichenbacher Oracle attack vulnerability (CVE-2026-69247 / SFTY-20260803-51569) during the safety check CI.
**Action:** Upgraded `cryptography` to version 50.0.1 in `backend/requirements.production.txt` to resolve the issue.
