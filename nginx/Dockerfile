FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci --legacy-peer-deps

COPY frontend ./frontend

ARG EXPO_PUBLIC_BACKEND_URL
ARG EXPO_PUBLIC_API_TIMEOUT
ENV EXPO_PUBLIC_BACKEND_URL=${EXPO_PUBLIC_BACKEND_URL}
ENV EXPO_PUBLIC_API_TIMEOUT=${EXPO_PUBLIC_API_TIMEOUT}

RUN npm --prefix frontend run build:web


FROM nginx:1.25-alpine

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
