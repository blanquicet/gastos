# Improved CI/CD Workflow - Test Docker Image

## Proposed Workflow (Build → Test → Push)

```yaml
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    name: Build and Test
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      # Build image but don't push yet - load locally
      - name: Build Docker image
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          load: true  # Load to local Docker daemon
          tags: gastos-api:test
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      # Start services with docker-compose
      - name: Start test environment
        run: |
          cat > docker-compose.test.yml <<EOF
          services:
            postgres:
              image: postgres:16
              environment:
                POSTGRES_USER: gastos
                POSTGRES_PASSWORD: gastos_test_password
                POSTGRES_DB: gastos_test
              ports:
                - 5432:5432
              healthcheck:
                test: ["CMD", "pg_isready"]
                interval: 10s
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
                - 8080:8080
          EOF
          
          docker-compose -f docker-compose.test.yml up -d
          
          # Wait for API to be healthy
          timeout 30 bash -c 'until curl -f http://localhost:8080/health; do sleep 1; done'
      
      # Run migrations
      - name: Run migrations
        run: |
          docker-compose -f docker-compose.test.yml exec -T api \
            migrate -path ./migrations -database "$DATABASE_URL" up
      
      # Run integration tests
      - name: Run API integration tests
        run: |
          cd backend/tests/api-integration
          ./test-api.sh
      
      # Show logs on failure
      - name: Show logs on failure
        if: failure()
        run: |
          docker-compose -f docker-compose.test.yml logs api
      
      # Cleanup
      - name: Stop test environment
        if: always()
        run: docker-compose -f docker-compose.test.yml down -v
  
  push:
    runs-on: ubuntu-latest
    name: Push to Registry
    needs: build-and-test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}/api
          tags: |
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}
      
      # Rebuild and push (uses cache from build-and-test)
      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./backend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  
  deploy:
    runs-on: ubuntu-latest
    name: Deploy to Azure
    needs: push
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: production
    
    steps:
      - name: Azure Login
        uses: azure/login@v2
        with:
          creds: |
            {
              "clientId": "${{ secrets.ARM_CLIENT_ID }}",
              "clientSecret": "${{ secrets.ARM_CLIENT_SECRET }}",
              "subscriptionId": "${{ secrets.ARM_SUBSCRIPTION_ID }}",
              "tenantId": "${{ secrets.ARM_TENANT_ID }}"
            }
      
      - name: Deploy to Container Apps
        uses: azure/container-apps-deploy-action@v2
        with:
          resourceGroup: gastos-rg
          containerAppName: gastos-api
          imageToDeploy: ghcr.io/${{ github.repository }}/api:${{ github.sha }}
```

## Benefits

1. **Test Real Artifact**: Tests run against actual Docker image
2. **Catch Dockerfile Issues**: Build problems found before tests
3. **Production Parity**: Same environment in CI and production
4. **Only Push if Tests Pass**: Failed tests = no push
5. **Docker Caching**: Rebuild uses cache, fast

## Trade-offs

| Aspect | Current (go run) | Proposed (docker) |
|--------|------------------|-------------------|
| Speed | ✅ Faster (~2min) | ⚠️ Slower (~4min) |
| Accuracy | ⚠️ Source code | ✅ Real artifact |
| Simplicity | ✅ Simple | ⚠️ More complex |
| Confidence | ⚠️ Medium | ✅ High |
| Docker issues | ❌ Found late | ✅ Found early |

## When to Switch

**Keep current approach if:**
- Rapid development phase
- Dockerfile is stable
- Speed is priority
- Team is comfortable with it

**Switch to proposed approach if:**
- Preparing for production
- Had Dockerfile issues in production
- Want maximum confidence
- CI time is acceptable

## Hybrid Approach (Best of Both)

Keep both approaches:

```yaml
jobs:
  # Fast tests for PRs
  quick-test:
    if: github.event_name == 'pull_request'
    # Use go run (fast)
  
  # Full tests for main branch
  full-test:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    # Use Docker (thorough)
```

## Current Status

Your current workflow is **good for now** ✅

**Recommendation:** 
- Keep current approach for Phase 2A/2B development
- Switch to Docker-based testing when preparing for production launch
- Add smoke tests in production to catch any remaining issues
