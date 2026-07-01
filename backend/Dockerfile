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

EXPOSE 8787

# Migrate then start. Using shell form so the shell expands env vars at runtime.
CMD bunx prisma migrate deploy && bun src/app.ts
