# CI/CD Workflow - Docker-Based Testing

## Workflow Overview

The CI/CD pipeline now tests the actual Docker image before deployment.

```
┌─────────────────┐
│  1. Unit Tests  │  ← Fast Go tests (source code)
└────────┬────────┘
         │
         ✓ Pass
         │
┌────────▼───────────────────┐
│  2. Build & Test Image     │  ← Build Docker, test container
│     - Build image          │
│     - Start with compose   │
│     - Run integration tests│
│     - Push if tests pass   │
└────────┬───────────────────┘
         │
         ✓ Pass & main branch
         │
┌────────▼──────────┐
│  3. Deploy        │  ← Deploy tested image
│     to Azure      │
└───────────────────┘
```

## Jobs

### 1. unit-test

**Purpose:** Fast feedback on code changes

**Steps:**
1. Setup PostgreSQL service
2. Install Go and dependencies
3. Run database migrations
4. Run unit tests (`go test -v -race ./...`)

**Duration:** ~2 minutes
**Runs on:** Every PR and push

---

### 2. build-and-test

**Purpose:** Build and test the actual Docker image

**Steps:**
1. Build Docker image (with cache)
2. Load image locally (`gastos-api:test`)
3. Create docker-compose.test.yml
4. Start PostgreSQL + API containers
5. Wait for API health check
6. Run database migrations
7. Run integration tests against container
8. **Push to GHCR only if tests pass** (main branch only)

**Duration:** ~4-5 minutes
**Runs on:** Every PR and push
**Pushes:** Only on main branch after tests pass

**Key Features:**
- ✅ Tests the actual Docker image
- ✅ Uses docker-compose for realistic environment
- ✅ Only pushes if tests pass
- ✅ Docker layer caching for speed
- ✅ Shows container logs on failure

---

### 3. deploy

**Purpose:** Deploy to Azure Container Apps

**Steps:**
1. Login to Azure
2. Deploy image to Container Apps

**Duration:** ~1-2 minutes
**Runs on:** Only on main branch push (after build-and-test passes)

---

## Testing Strategy

### Unit Tests (Fast)
```bash
# Run locally
cd backend
go test -v -race ./...
```

**What it tests:**
- Service layer logic
- Repository methods
- Business rules
- Authorization checks

**Duration:** ~2 seconds

---

### Integration Tests (Docker)
```bash
# Run locally
docker build -t gastos-api:test backend/
docker compose -f docker-compose.test.yml up -d
cd backend/tests/api-integration
./test-api.sh
docker compose -f docker-compose.test.yml down
```

**What it tests:**
- Actual Docker image
- API endpoints
- Database interactions
- Authentication flows
- Error handling

**Duration:** ~10 seconds (after build)

---

## Key Improvements

| Aspect | Before (go run) | After (Docker) |
|--------|-----------------|----------------|
| **Test Target** | Source code | Docker image ✅ |
| **Environment** | Different from prod | Same as prod ✅ |
| **Dockerfile Issues** | Found in production | Found in CI ✅ |
| **Push Condition** | Always (if tests pass) | Only after image tests ✅ |
| **Confidence** | Medium | High ✅ |
| **Duration** | ~2 min | ~4-5 min |

---

## Docker Compose Test File

The workflow creates this file dynamically:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: gastos
      POSTGRES_PASSWORD: gastos_test_password
      POSTGRES_DB: gastos_test
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gastos"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    image: gastos-api:test
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://gastos:gastos_test_password@postgres:5432/gastos_test?sslmode=disable
      RATE_LIMIT_ENABLED: "false"
      SESSION_COOKIE_SECURE: "false"
    ports:
      - "8080:8080"
```

---

## Running Locally

### Option 1: Full Docker Test (Recommended)

```bash
# Build image
docker build -t gastos-api:test backend/

# Create docker-compose.test.yml (see above)

# Start environment
docker compose -f docker-compose.test.yml up -d

# Run migrations
export DATABASE_URL="postgres://gastos:gastos_test_password@localhost:5432/gastos_test?sslmode=disable"
cd backend
migrate -path ./migrations -database "$DATABASE_URL" up

# Run tests
cd tests/api-integration
./test-api.sh

# Cleanup
docker compose -f docker-compose.test.yml down -v
```

### Option 2: Quick Test (Development)

```bash
# Start only PostgreSQL
docker compose up -d postgres

# Run with go run
cd backend
export DATABASE_URL="postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable"
migrate -path ./migrations -database "$DATABASE_URL" up
go run cmd/api/main.go

# In another terminal
cd backend/tests/api-integration
./test-api.sh
```

---

## Caching Strategy

**GitHub Actions Cache:**
- Docker layer cache (`type=gha`)
- Shared between build and push steps
- Dramatically speeds up rebuilds

**How it works:**
1. First build: ~3-4 minutes (full build)
2. Subsequent builds: ~1-2 minutes (cache hit)
3. Push step: ~30 seconds (reuses cache)

---

## Failure Scenarios

### Unit Tests Fail
- ❌ Build-and-test doesn't run
- ❌ No Docker image built
- ❌ No deployment

### Integration Tests Fail
- ✅ Unit tests passed
- ❌ Docker image NOT pushed
- ❌ No deployment
- 📋 Container logs shown in CI

### Docker Build Fails
- ✅ Unit tests passed
- ❌ Integration tests don't run
- ❌ No push, no deployment

---

## Benefits

1. **Test Real Artifact**
   - Integration tests run against actual Docker image
   - Same image is deployed to production
   - No surprises in production

2. **Catch Docker Issues Early**
   - Dockerfile problems found in CI
   - Environment issues caught before deploy
   - Dependencies validated in container

3. **Only Push if Tests Pass**
   - Failed integration tests = no push
   - Registry only contains tested images
   - Clean image history

4. **Production Parity**
   - Same PostgreSQL version
   - Same environment variables
   - Same networking setup

5. **Better Debugging**
   - Container logs on failure
   - Easy to reproduce locally
   - docker-compose for local dev

---

## Monitoring

**GitHub Actions:**
- All jobs visible in Actions tab
- Clear pass/fail indicators
- Detailed logs for each step

**Container Registry:**
- Only successful builds pushed
- Image tags include commit SHA
- Latest tag for main branch

**Azure Container Apps:**
- Health checks verify deployment
- Auto-rollback on failure
- Logs available in Azure Portal

---

## Next Steps

**Phase 2B (Frontend):**
- Add E2E tests to workflow
- Test frontend + backend together
- Playwright tests in CI

**Future Improvements:**
- Add smoke tests after deployment
- Implement blue-green deployments
- Add performance benchmarks
- Security scanning (Trivy/Snyk)

---

## Troubleshooting

### Tests pass locally but fail in CI
- Check environment variables
- Verify PostgreSQL version matches
- Check timing issues (increase timeouts)

### Docker build is slow
- Check cache is working (`cache-from: type=gha`)
- Verify layer ordering in Dockerfile
- Consider multi-stage build optimization

### Integration tests timeout
- Increase timeout in workflow (currently 60s)
- Check API startup time
- Verify health check endpoint

---

**Status:** ✅ Implemented and ready for testing
**Version:** 1.0
**Last Updated:** 2025-12-30
