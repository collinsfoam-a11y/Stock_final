# Incident Runbook

## SQL Injection Alert

### Detection
- Alert: `SQLInjectionDetected`
- Triggered when >5 injection attempts in 1 hour

### Response Steps
1. **Immediate Action**: Block source IP via WAF
2. **Investigation**: Check logs for attack patterns (comment splits, Unicode, CTE)
3. **Validation**: Verify SQLServerConnector is blocking all known bypasses
4. **Escalation**: Notify security team if pattern matches zero-day

## Optimistic Lock Conflict Alert

### Detection
- Alert: `OptimisticLockConflictHigh`
- Triggered when >10 conflicts in 1 hour

### Response Steps
1. **Immediate Action**: Check inventory service health and database locks
2. **Investigation**: Identify high-frequency update endpoints
3. **Validation**: Verify client retry logic and version handling
4. **Escalation**: Notify resilience team if conflict rate persists

## Database Connection Failure Alert

### Detection
- Alert: `DatabaseConnectionFailure`
- Triggered when >3 failures in 1 hour

### Response Steps
1. **Immediate Action**: Check SQL Server availability and network connectivity
2. **Investigation**: Review connection pool metrics and timeout settings
3. **Validation**: Verify failover configuration and backup DB status
4. **Escalation**: Notify DBA team if primary DB is unreachable