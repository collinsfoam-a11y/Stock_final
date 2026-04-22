# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build:web


FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache libcap \
    && mkdir -p /var/cache/nginx /var/run /tmp \
    && chown -R nginx:nginx /var/cache/nginx /var/run /tmp /usr/share/nginx/html /etc/nginx/conf.d \
    && setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx

COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
