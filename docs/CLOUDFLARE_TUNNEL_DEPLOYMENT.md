# Cloudflare Tunnel Deployment Guide

This documents how to front the Stock Verify production stack
(`docker-compose.production.yml`) with a Cloudflare Tunnel instead of, or
in addition to, exposing ports 80/443 directly. Nothing in this doc
requires code changes -- it's a topology and configuration guide for the
operator standing up the deployment.

There is no `cloudflared` service in `docker-compose.production.yml` by
design: the tunnel token is deployment-specific and must never be
committed, so it's wired up as a separate step below rather than baked
into the shared compose file.

## Topology

```
Browser --HTTPS--> Cloudflare edge --tunnel--> cloudflared --HTTP--> nginx:80 --> backend:8001
                                                                         \--> static frontend (dist/)
```

`nginx` (built from `nginx/Dockerfile`, config in `nginx/nginx.conf`) is
the single ingress for both the static frontend build and the `/api/`,
`/health`, and `/ws/` backend proxy routes (see [nginx/nginx.conf](../nginx/nginx.conf)).
Because Cloudflare terminates the public TLS connection, `cloudflared` only
needs to reach nginx over **plain HTTP** on the internal docker network --
it does not need the `nginx` container's port 443/SSL listener at all.

## 1. Add `cloudflared` to the stack

Run `cloudflared` as its own container on the same docker network as
`docker-compose.production.yml`, pointed at the `nginx` service by its
compose service name (Docker's embedded DNS resolves `nginx` to the
container's internal IP automatically):

```yaml
# docker-compose.cloudflared.yml (separate file -- do not merge into
# docker-compose.production.yml, since the tunnel token is a secret and
# this file's presence is deployment-specific)
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: stock-verify-cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN is required}
    networks:
      - default

networks:
  default:
    name: stock_final_default
    external: true
```

Run both files together:

```bash
docker compose -f docker-compose.production.yml -f docker-compose.cloudflared.yml up -d
```

`stock_final_default` is the network name Compose derives from this
project's directory (`stock_final`); confirm the real network name with
`docker network ls` if you renamed the project.

## 2. Configure the public hostname (Cloudflare dashboard or config.yml)

Point the tunnel's public hostname at nginx over **plain HTTP**, not
HTTPS -- nginx's port 80 server in this repo only serves the ACME
challenge path and a 301 redirect (see `nginx/nginx.conf`'s `listen 80`
server block), so route the tunnel's *service* at the container directly
rather than through the redirect:

| Setting | Value |
|---|---|
| Public hostname | `stock-verify.example.com` |
| Service | `http://nginx:80` |

Since nginx's `listen 80` server only returns `301 https://...` for
everything except `/healthz` and the ACME challenge path, pointing
`cloudflared` at `http://nginx:80` for real traffic will bounce every
request through a redirect that never terminates (Cloudflare's tunnel
already provides HTTPS at the edge, so there's no reason to redirect
again internally). Two supported options:

- **Recommended:** point the tunnel service at nginx's `443 ssl` server
  block instead (`https://nginx:443`, with `noTLSVerify: true` in the
  ingress rule, since the internal cert is self-signed/Let's Encrypt for
  the wrong context). This reuses the existing HTTPS server block
  unchanged.
- **Alternative:** add a dedicated `listen 8080;` server block in
  `nginx/nginx.conf` that mirrors the `443 ssl` server's `location`
  blocks without the `301` redirect, and point the tunnel at
  `http://nginx:8080`. See [nginx/default.conf.example](../nginx/default.conf.example)
  for a minimal template if you take this route.

## 3. Health-check paths

| Path | Use |
|---|---|
| `/healthz` | nginx's own liveness (returns `200 ok` unconditionally, no backend dependency) -- use this for Cloudflare's tunnel-level health checks |
| `/health` | Proxied to the backend's basic health check (`backend/api/health.py::health_check`); always returns HTTP 200, with `status: healthy|degraded` in the body |
| `/health/ready` | Proxied only if you add a location block for it (not in the current `nginx.conf`); returns HTTP 503 if MongoDB is unreachable -- suitable for a stricter readiness probe if you add it |

`/healthz` is the right choice for Cloudflare's own edge health checks
(cheap, no backend dependency, always reflects whether nginx itself is
up). Use `/health` for external monitoring that should reflect backend +
MongoDB status.

## 4. CORS / allowed origins

Set `CORS_ALLOW_ORIGINS` and `ALLOWED_HOSTS` in `.env.prod` to the exact
public hostname the tunnel exposes (see
[DEPLOYMENT_ENVIRONMENT.md](DEPLOYMENT_ENVIRONMENT.md)):

```
CORS_ALLOW_ORIGINS=https://stock-verify.example.com
ALLOWED_HOSTS=stock-verify.example.com
```

Because the browser only ever talks to the Cloudflare-fronted hostname
(never `nginx:80` or a raw IP), these values do not need to include the
internal docker service name.

## 5. WebSocket / SSE support

`nginx/nginx.conf` already proxies `/ws/` with the required `Upgrade` /
`Connection` headers and long timeouts for persistent connections (see
the `location /ws/` block). Cloudflare Tunnel supports WebSocket
passthrough by default for HTTP-based tunnels -- no separate
configuration is required on the tunnel side, but confirm the public
hostname's Cloudflare proxy setting is "Proxied" (orange cloud), not
"DNS only", or the tunnel won't be used at all.

## 6. Upload size limits

`nginx/nginx.conf` sets `client_max_body_size 10M;` globally. Evidence
photos in this app are transmitted as base64 JSON fields
(`photo_base64`) rather than multipart file uploads (see
[DEPLOYMENT_ENVIRONMENT.md](DEPLOYMENT_ENVIRONMENT.md)'s note on
`UPLOAD_STORAGE_PATH`), so this limit bounds the total JSON payload size
per count-line write, not a separate upload endpoint. Cloudflare's own
free-tier request body limit is 100MB, well above this, so no additional
tunnel-side configuration is needed.

## 7. Tunnel token handling

- `CLOUDFLARE_TUNNEL_TOKEN` must be supplied via `.env.prod` (or the host's
  secret manager) exactly like the other secrets in
  [DEPLOYMENT_ENVIRONMENT.md](DEPLOYMENT_ENVIRONMENT.md) -- never commit
  it, and never put it directly in `docker-compose.cloudflared.yml`.
- If you use a locally-managed tunnel (`cloudflared tunnel create` with a
  credentials JSON file instead of a dashboard-managed token), mount that
  file as a read-only volume and add it to `.gitignore` / `.dockerignore`
  the same way `.env.prod` already is.

## 8. Fallback / rollback if the tunnel goes down

Because `docker-compose.production.yml`'s `nginx` service still binds
`80:80` and `443:443` directly (see the `ports:` block), the stack
remains reachable over a direct IP/port or a non-Cloudflare DNS record at
all times -- the tunnel is additive, not the only ingress path. To roll
back to direct exposure:

1. Point the public DNS record back at the host's IP (A/AAAA record)
   instead of the Cloudflare tunnel CNAME.
2. Stop the `cloudflared` container: `docker compose -f docker-compose.cloudflared.yml down`.
3. Confirm `nginx`'s certbot-issued certificate (`nginx/ssl/`, see
   `scripts/init_letsencrypt.sh`) is still valid for direct HTTPS access.

No backend or frontend configuration changes are needed for this
fallback since both paths terminate at the same nginx container.
