FROM oven/bun:1-alpine

WORKDIR /app

COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile

COPY backend/prisma ./prisma
RUN bunx prisma generate

COPY backend/src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy && bun prisma/seed.ts && exec bun src/app.ts"]
