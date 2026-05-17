# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:web


FROM nginx:1.27-alpine AS runtime

RUN addgroup -S app -g 10001 \
    && adduser -S -D -H -u 10001 -G app app \
    && apk add --no-cache libcap \
    && mkdir -p /var/cache/nginx /var/run /tmp \
    && chown -R app:app /var/cache/nginx /var/run /tmp /usr/share/nginx/html /etc/nginx/conf.d \
    && setcap 'cap_net_bind_service=+ep' /usr/sbin/nginx

COPY --chown=app:app nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=app:app /app/dist /usr/share/nginx/html

USER 10001:10001

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
