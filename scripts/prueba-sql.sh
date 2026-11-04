#!/usr/bin/env bash
# Prueba el SQL de supabase/ en un Postgres local con Docker (nunca toca Supabase).
# Corre restricciones_menores_prueba.sql, que incluye todas las anteriores.
# Uso: npm run test:sql   (requiere Docker)
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash en Windows: no convertir /sql en C:/...
cd "$(dirname "$0")/.."
NOMBRE=licor-pg-prueba
docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
docker run -d --name "$NOMBRE" -e POSTGRES_PASSWORD=prueba postgres:15 >/dev/null
trap 'docker rm -f "$NOMBRE" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 60); do docker exec "$NOMBRE" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker cp supabase/. "$NOMBRE":/sql
docker exec "$NOMBRE" psql -U postgres -v ON_ERROR_STOP=1 -q -f /sql/pruebas/restricciones_menores_prueba.sql 2>&1 | grep -v NOTICE
