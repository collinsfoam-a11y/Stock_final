#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.prod"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.production.yml"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${DOMAIN:?DOMAIN is required}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL is required}"

CERT_DIR="${ROOT_DIR}/nginx/ssl"
LIVE_DIR="${CERT_DIR}/live/${DOMAIN}"

mkdir -p "${CERT_DIR}"

if [ ! -f "${CERT_DIR}/fullchain.pem" ] || [ ! -f "${CERT_DIR}/privkey.pem" ]; then
  echo "Creating temporary self-signed certificate..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${CERT_DIR}/privkey.pem" \
    -out "${CERT_DIR}/fullchain.pem" \
    -subj "/CN=${DOMAIN}"
fi

echo "Starting nginx for ACME challenge..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d nginx

echo "Requesting Let's Encrypt certificate for ${DOMAIN}..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d "${DOMAIN}" -d "www.${DOMAIN}" \
  --email "${CERTBOT_EMAIL}" --agree-tos --no-eff-email

if [ -f "${LIVE_DIR}/fullchain.pem" ] && [ -f "${LIVE_DIR}/privkey.pem" ]; then
  ln -sf "${LIVE_DIR}/fullchain.pem" "${CERT_DIR}/fullchain.pem"
  ln -sf "${LIVE_DIR}/privkey.pem" "${CERT_DIR}/privkey.pem"
fi

echo "Reloading nginx..."
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" restart nginx

echo "Certificate provisioning complete."
