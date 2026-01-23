#!/bin/bash
set -e

cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

echo "=== Installing dependencies ==="
bun install

echo ""
echo "=== Building backend and frontend ==="
bun run build

echo ""
echo "=== Building docs ==="
cd docs
bun install
bun run build || echo "Warning: docs build had some errors (non-fatal)"
cd "$ROOT_DIR"

echo ""
echo "=== Running type check ==="
bun run check

echo ""
echo "=== Running frontend tests ==="
cd frontend
TEST_FILES=$(find src -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" 2>/dev/null | head -1)
if [ -n "$TEST_FILES" ]; then
    bun run test
else
    echo "No test files found, skipping tests"
fi
cd "$ROOT_DIR"

echo ""
echo "=== All builds completed successfully ==="
echo ""
echo "=== Starting server ==="
cd backend
exec bun run dev
