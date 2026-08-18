#!/usr/bin/env bash

set -Eeuo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "ไม่พบไฟล์ .env — สร้างจาก .env.example และกรอกค่า secret ก่อน" >&2
  exit 1
fi

echo "ตรวจสอบ Docker Compose configuration..."
docker compose -f "$COMPOSE_FILE" config --quiet

echo "หยุด backend และ admin ก่อน build (PostgreSQL จะทำงานต่อ)..."
docker compose -f "$COMPOSE_FILE" stop backend admin

echo "Build backend และ admin..."
docker compose -f "$COMPOSE_FILE" build backend admin

echo "เริ่ม backend และ admin จาก image ที่ build แล้ว..."
docker compose -f "$COMPOSE_FILE" up -d --no-build backend admin

echo "ตรวจสอบสถานะ service..."
docker compose -f "$COMPOSE_FILE" ps
