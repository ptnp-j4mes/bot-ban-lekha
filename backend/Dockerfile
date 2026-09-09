FROM node:22-slim AS base
COPY --from=oven/bun:1.2.23-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies (separate layer for cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# Copy Prisma schema first so generate runs with the right schema
COPY prisma ./prisma
RUN node node_modules/prisma/build/index.js generate

# Copy the rest of the source
COPY src ./src

EXPOSE 3000

# Migrate, run the idempotent seed (production creates only the super admin),
# then replace the shell so SIGTERM reaches Bun during rolling deploys.
CMD node node_modules/prisma/build/index.js migrate deploy && bun prisma/seed.ts && exec bun src/app.ts
