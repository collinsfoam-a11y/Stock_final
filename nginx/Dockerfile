FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

RUN npm install -g pnpm@10

COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN pnpm --prefix frontend install --frozen-lockfile

COPY frontend ./frontend

ARG EXPO_PUBLIC_BACKEND_URL
ARG EXPO_PUBLIC_API_TIMEOUT
ENV EXPO_PUBLIC_BACKEND_URL=${EXPO_PUBLIC_BACKEND_URL}
ENV EXPO_PUBLIC_API_TIMEOUT=${EXPO_PUBLIC_API_TIMEOUT}

RUN pnpm --prefix frontend run build:web


FROM nginx:1.25-alpine

RUN apk add --no-cache libcap \
    && mkdir -p /var/cache/nginx /var/run /var/log/nginx /var/www/certbot \
    && chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx /var/www/certbot /usr/share/nginx/html \
    && setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx

COPY --chown=nginx:nginx nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build --chown=nginx:nginx /app/frontend/dist /usr/share/nginx/html

USER nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/healthz || exit 1
