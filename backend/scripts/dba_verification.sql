-- DBA_PERMISSION_VERIFICATION
-- Required by Gate 3 Governance per SQL安全与生产就绪治理规范 §3

SELECT 
    dp.permission_name, 
    dp.state_desc
FROM sys.database_permissions dp
JOIN sys.database_principals dp2
  ON dp.grantee_principal_id = dp2.principal_id
WHERE dp2.name = 'stock_verify_user';

-- EXPECTED OUTPUT:
-- permission_name | state_desc
-- SELECT          | GRANT