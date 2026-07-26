# Kubernetes Reference

The manifests in this directory are reference-only and are not the canonical deployment path for this repository.

The supported production path is [`docker-compose.production.yml`](/Users/noufi1/stk_final/Stock_final/docker-compose.production.yml) with a host-level `.env.prod`.

If Kubernetes support is revived later, these manifests should be brought back into parity with:
- the actual image publishing flow in [`.github/workflows/main.yml`](/Users/noufi1/stk_final/Stock_final/.github/workflows/main.yml)
- the backend env contract in [`backend/config.py`](/Users/noufi1/stk_final/Stock_final/backend/config.py)
- the current nginx/frontend deployment model
