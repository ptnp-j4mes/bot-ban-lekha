FROM oven/bun:1

WORKDIR /app

# ponytail: single stage — prisma CLI (devDependency) is needed at runtime for `migrate deploy`,
# so a slim prod-only stage buys nothing here.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
RUN bunx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

# Apply pending migrations, seed the super admin (idempotent), then start.
CMD ["sh", "-c", "bunx prisma migrate deploy && bun prisma/seed.ts && bun src/app.ts"]
