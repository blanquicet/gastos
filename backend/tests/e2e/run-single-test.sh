#!/bin/bash
set -e

# Simple test runner for individual E2E tests
# Usage: ./run-single-test.sh movement-familiar.js

if [ $# -eq 0 ]; then
    echo "Usage: ./run-single-test.sh <test-file.js>"
    echo "Example: ./run-single-test.sh movement-familiar.js"
    exit 1
fi

TEST_FILE=$1

echo "🚀 Starting E2E Test: $TEST_FILE"
echo "================================"

# Check if database is running
if ! pg_isready -h localhost -p 5432 -U gastos 2>/dev/null; then
    echo "❌ PostgreSQL is not running on localhost:5432"
    echo "Please start the database with: cd backend && docker compose up -d"
    exit 1
fi

# Kill any existing backend on port 8080
echo "🧹 Cleaning up any existing backend processes..."
lsof -ti:8080 | xargs -r kill -9 2>/dev/null || true
sleep 1

# Navigate to backend directory (from tests/e2e)
cd ../../

# Always rebuild the backend binary
echo "📦 Building backend..."
go build -o gastos-api ./cmd/api

# Set environment variables for local testing
export DATABASE_URL="postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable"
export STATIC_DIR="../frontend"
export RATE_LIMIT_ENABLED="false"
export SESSION_COOKIE_SECURE="false"
export EMAIL_PROVIDER="noop"

# Start backend and redirect logs to /tmp/backend.log
echo "🔧 Starting backend server..."
./gastos-api > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
    fi
    echo "✅ Cleanup complete"
}

trap cleanup EXIT INT TERM

# Wait for backend to be healthy
echo "⏳ Waiting for backend to be ready..."
sleep 3
timeout 30 bash -c 'until curl -sf http://localhost:8080/health > /dev/null; do sleep 1; done' || {
    echo "❌ Backend failed to start"
    echo "Check /tmp/backend.log for errors"
    exit 1
}

echo "✅ Backend is healthy"
echo ""

# Run the test
echo "🧪 Running test: $TEST_FILE"
cd tests
node "e2e/$TEST_FILE"
TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Test passed!"
else
    echo ""
    echo "❌ Test failed with exit code $TEST_EXIT_CODE"
    echo "Check /tmp/backend.log for backend errors"
    exit $TEST_EXIT_CODE
fi
