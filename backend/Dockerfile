FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies (separate layer for cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy Prisma schema first so generate runs with the right schema
COPY prisma ./prisma
RUN bunx prisma generate

# Copy the rest of the source
COPY src ./src

EXPOSE 3000

# Migrate, run the idempotent seed (production creates only the super admin),
# then replace the shell so SIGTERM reaches Bun during rolling deploys.
CMD bunx prisma migrate deploy && bun prisma/seed.ts && exec bun src/app.ts
