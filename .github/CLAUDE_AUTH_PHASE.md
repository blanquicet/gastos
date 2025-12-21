# CLAUDE_AUTH_PHASE.md — Gastos App (Auth-only Phase)

This file is the single source of truth for AI assistants (Claude in VS Code) working on this repository.

If any suggestion conflicts with this document, this document wins.

---

## 1) Current phase goal

**IMPORTANT: This phase is AUTH ONLY.** ✅ COMPLETED

- ✅ Implement authentication and session management.
- ✅ Force login before registering movements.
- ✅ Keep the existing **Excel + n8n** pipeline unchanged.
- ✅ Do **not** migrate movements to a database yet.
- ✅ Use **Azure PostgreSQL** for authentication data.
- ✅ Do **not** introduce Supabase (managed or self-hosted) in this phase.
- ⏳ n8n will disappear later, but **not** now.

---

## 2) Repository strategy (decided)

**MONOREPO**.

Frontend and backend live in the same Git repository, but:

- They are logically separated into `/frontend` and `/backend`.
- They are deployed independently.
- They never import each other’s code.
- Avoid any refactor that changes this separation in the auth-only phase.

Do not suggest splitting into multiple repositories at this stage.

---

## 3) Canonical repository structure (authoritative)

Do not change this structure unless explicitly requested.

```text
gastos/
  frontend/
    registrar-movimiento/
      index.html
      app.js
      styles.css
      staticwebapp.config.json

  backend/
    cmd/
      api/
        main.go
    internal/
      config/
      httpserver/
      middleware/
      auth/
      users/
      sessions/
      email/
      n8nclient/
    migrations/
    go.mod
    go.sum

  .github/
    workflows/
      deploy-swa.yml
      deploy-api.yml
    CLAUDE_AUTH_PHASE.md

  README.md
```

---

## 4) Deployment model (decided)

### 4.1 Frontend (Azure Static Web Apps)

- Hosted on **Azure Static Web Apps**
- Deploys only `frontend/**`
- Served at:
  - `https://gastos.blanquicet.com.co/registrar-movimiento`

SWA settings:

- `app_location = /frontend/registrar-movimiento`
- `skip_app_build = true`
- Cloudflare DNS must be **DNS-only**

### 4.2 Backend API (Go)

- Written in Go
- Deployed independently (VM + Caddy or Azure Container Apps)
- Planned domain:
  - `https://api.gastos.blanquicet.com.co`

Frontend must only talk to the backend API.

---

## 5) Existing system (must remain working)

- n8n runs on a VM behind Caddy.
- n8n writes movements to an Excel / Google Sheets ledger.
- This pipeline must remain unchanged during the auth phase.

Transition goal:

- Browser → Go API
- Go API → n8n (server-to-server)
- Secrets never exposed to the browser.

---

## 6) Auth architecture (decided)

### 6.1 Authentication style

- Session-based authentication.
- Cookies (not JWT in localStorage).
- Server-side session storage.

### 6.2 Cookie requirements

- HttpOnly
- Secure
- SameSite=Lax
- Persistent sessions

### 6.3 Frontend behavior

- Use `fetch(..., { credentials: "include" })`
- Show login/register if unauthenticated
- Show registrar-movimiento if authenticated
- No secrets in frontend

---

## 7) Required API endpoints (auth)

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

All protected endpoints must use auth middleware.

---

## 8) Database decision (AUTH ONLY)

**Decision: Use Azure Database for PostgreSQL (Flexible Server).**

This database is used **only** for authentication data in this phase.
Movements remain in Excel via n8n.

### 8.1 Driver and tooling (decided)

- Driver: `pgx` (preferred PostgreSQL driver for Go)
- Migrations: `golang-migrate`
- Connection string: read from environment variable `DATABASE_URL`
- SSL: required and enforced (Azure PostgreSQL requirement)

### 8.2 Minimal schema (implemented)

- users
  - id (uuid, primary key)
  - email (text, unique, not null)
  - name (text, not null)
  - password_hash (text, not null)
  - created_at (timestamptz)
  - updated_at (timestamptz)

- sessions
  - id (uuid, primary key)
  - user_id (uuid, fk users)
  - expires_at (timestamptz)
  - created_at (timestamptz)

- password_resets
  - id (uuid, primary key)
  - user_id (uuid, fk users)
  - token_hash (text)
  - expires_at (timestamptz)
  - used_at (timestamptz)
  - created_at (timestamptz)

---

## 9) Security requirements (implemented)

- Password hashing: argon2id (implemented via golang.org/x/crypto/argon2)
- Tokens stored hashed, never plaintext
- Constant-time comparisons for token validation
- No auth logic in n8n
- No secrets in frontend
- Rate limiting on auth endpoints:
  - Login/Register: 5 requests per minute per IP
  - Password reset: 3 requests per minute per IP
- Session cookies:

  - HttpOnly: true (always - prevents JavaScript access)
  - Secure: environment-dependent (true in production, false in local dev)
  - SameSite: Lax
  - Duration: 30 days
- Email validation requires full domain format (user\@domain.com)

---

## 10) Explicit non-goals for this phase

Do not:

- Migrate Excel to DB
- Add Supabase
- Add RLS
- Add roles or permissions
- Split repositories
- Introduce JWT in localStorage
- Over-engineer the solution

---

## 11) CI/CD expectations (high level)

Two independent workflows:

1) deploy-swa.yml ✅ DONE

    - Triggers on `frontend/**`
    - Deploys Azure Static Web App

2) deploy-api.yml

    - Triggers on `backend/**`
    - Builds and deploys Go API

3) terraform.yml ✅ DONE

    - Triggers on `infra/**` (ignores `*.md`)
    - Runs `terraform plan` on PRs
    - Runs `terraform apply` on push to main

    Do not combine these workflows.

---

## 12) Infrastructure status (completed)

### 12.1 PostgreSQL ✅ DONE

| Property | Value                                                |
| -------- | ---------------------------------------------------- |
| Server   | `gastos-auth-postgres.postgres.database.azure.com`   |
| Database | `gastos_auth`                                        |
| Admin    | `gastosadmin`                                        |
| Region   | `brazilsouth`                                        |
| Version  | PostgreSQL 16                                        |
| SKU      | B_Standard_B1ms                                      |
| SSL      | Required                                             |

### 12.2 Terraform state ✅ DONE

| Property        | Value            |
| --------------- | ---------------- |
| Storage Account | `gastostfstate`  |
| Container       | `tfstate`        |
| Key             | `gastos.tfstate` |

### 12.3 GitHub Actions secrets ✅ DONE

All ARM_* secrets configured for Service Principal `github-actions-gastos`.

### 12.4 Azure values

| Resource        | Value                                    |
| --------------- | ---------------------------------------- |
| Tenant ID       | `9de9ca20-a74e-40c6-9df8-61b9e313a5b3`   |
| Subscription ID | `0f6b14e8-ade9-4dc5-9ef9-d0bcbaf5f0d8`   |
| Resource Group  | `gastos-rg`                              |

---

## 13) Implementation Status ✅ COMPLETED

The authentication system is fully implemented and functional.

### 13.1 Backend Implementation

**Structure:**

- ✅ `backend/` folder with Go module
- ✅ SQL migrations (4 total):
  - 001_create_users
  - 002_create_sessions
  - 003_create_password_resets
  - 004_add_name_to_users
- ✅ HTTP server with structured routing
- ✅ All auth endpoints implemented and tested
- ✅ Session-based authentication working
- ✅ Rate limiting on auth endpoints

**Endpoints implemented:**

- `GET /health` - Health check
- `POST /auth/register` - User registration (requires email, name, password)
- `POST /auth/login` - User login
- `POST /auth/logout` - User logout
- `GET /me` - Get current user info
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token

**Key features:**

- Argon2id password hashing
- 30-day persistent sessions
- Rate limiting (5 req/min for login/register, 3 req/min for password reset)
- CORS configured for local development and production
- Static file serving for local development

### 13.2 Frontend Implementation

**Features:**

- Login/register forms with form switching
- Real-time password match validation
- Password strength indicator (Débil, Regular, Buena, Fuerte)
- Email validation with visual feedback
- Password visibility toggle (eye icon)
- Loading states on form submission
- Auto-focus on form fields
- Responsive design (mobile-first)
- Name field required for better UX in movement tables

**User flow:**

1. User lands on login page
2. Can switch to registration
3. Registers with name, email, and strong password
4. Automatically logged in after registration
5. Session persists for 30 days
6. Name displayed in app header

### 13.3 Deployment

**Backend:**

- ✅ Deployed to Azure Container Apps
- ✅ Custom domain: `api.gastos.blanquicet.com.co`
- ✅ CI/CD via `.github/workflows/deploy-api.yml`
- ✅ Environment variables configured in Azure

**Frontend:**

- ✅ Deployed to Azure Static Web Apps
- ✅ Custom domain: `gastos.blanquicet.com.co`
- ✅ CI/CD via `.github/workflows/deploy-swa.yml`

**Database:**

- ✅ Azure PostgreSQL Flexible Server
- ✅ Migrations applied to production
- ✅ Connection from backend working
- ✅ SSL required and enforced

### 13.4 Local Development Setup

**Prerequisites:**

- Docker & Docker Compose (for PostgreSQL)
- Go 1.21+
- golang-migrate CLI

**Setup:**

1. `docker compose up -d` - Start local PostgreSQL
2. `cd backend && cp .env.example .env` - Configure backend
3. `migrate -path ./migrations -database "$DB_URL" up` - Run migrations
4. `go run cmd/api/main.go` - Start backend on port 8080
5. Access `http://localhost:8080` - Backend serves frontend

Full setup guide available in `DEVELOPMENT.md`.

---

## 14) First message for a new Claude chat

Use the context from `.github/CLAUDE_AUTH_PHASE.md` and create the Go backend skeleton for authentication. Start with:

1. Initialize `backend/` with `go.mod` (module: `github.com/blanquicet/gastos/backend`)
2. Create SQL migrations in `backend/migrations/` for users, sessions, password_resets tables
3. Create `backend/cmd/api/main.go` with basic HTTP server
4. Create the internal package structure as defined in section 3

The PostgreSQL database is already running at `gastos-auth-postgres.postgres.database.azure.com` with database `gastos_auth`. Use `DATABASE_URL` environment variable for connection.
