FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Vite values are compiled into the static bundle. Railway exposes service
# variables to Docker builds only when the Dockerfile declares matching ARGs.
ARG VITE_API_BASE=""
ARG VITE_LIFF_ID=""
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_LIFF_ID=${VITE_LIFF_ID}

RUN bun run build

# ── runtime: nginx serves the built SPA ──────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# The official nginx entrypoint substitutes only these variables, preserving
# nginx runtime variables such as $host and $remote_addr in the template.
ENV PORT=5173 \
    BACKEND_HOST=backend \
    BACKEND_PORT=3000 \
    NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_HOST|BACKEND_PORT)$"

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
