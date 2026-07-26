# Cloudflare SQL Tunnel — sql.lavanyaemart.app

Remote access to the Lavanya_emart SQL Server (`192.168.1.8:1433`) via Cloudflare Tunnel.

## Topology

```
SQL Client --> cloudflared access tcp --> Cloudflare edge --> lavanya-sql tunnel --> 192.168.1.8:1433
```

Cloudflare TCP tunnels do **not** expose port 1433 directly on the public internet. Each client runs a small local proxy first, then connects to `localhost`.

## Tunnel details

| Setting | Value |
|---|---|
| Tunnel name | `lavanya-sql` |
| Tunnel ID | `8e638f66-cbdd-44ef-b089-3e2778b3e4b8` |
| Public hostname | `sql.lavanyaemart.app` |
| Internal target | `tcp://192.168.1.8:1433` |
| Connector host | Windows PC on `192.168.1.16` (same LAN as SQL Server) |
| Config file | `%USERPROFILE%\.cloudflared\config-lavanya-sql.yml` |

## Connect from a remote machine

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Run the helper script:

```powershell
.\scripts\connect_sql_via_tunnel.ps1
```

3. In SSMS / Azure Data Studio / sqlcmd, connect to:

```
Server: localhost,14330
```

Use your normal SQL authentication credentials.

Manual command:

```powershell
cloudflared access tcp --hostname sql.lavanyaemart.app --url 127.0.0.1:14330
```

## Run the tunnel permanently on the LAN connector PC

Run as **Administrator**:

```powershell
.\scripts\install_lavanya_sql_tunnel.ps1
```

This copies the SQL tunnel config to `%USERPROFILE%\.cloudflared\config.yml` and starts the `cloudflared` Windows service.

Verify:

```powershell
cloudflared tunnel info lavanya-sql
```

## Security recommendations

- Enable **Cloudflare Access** on `sql.lavanyaemart.app` so only approved users can open the TCP proxy.
- Keep SQL Server on `192.168.1.8` in **mixed mode or SQL auth** with strong passwords.
- Restrict SQL Server firewall to allow only `192.168.1.16` (the tunnel connector PC).
- Do not expose SQL Server with a public A record on port 1433.

## Troubleshooting

| Symptom | Check |
|---|---|
| DNS not resolving | `nslookup sql.lavanyaemart.app` should return Cloudflare addresses |
| Tunnel down | `cloudflared tunnel info lavanya-sql` should show an active connector |
| SQL timeout | From connector PC: `Test-NetConnection 192.168.1.8 -Port 1433` |
| Access denied | Confirm Cloudflare Access policy (if enabled) and SQL credentials |
