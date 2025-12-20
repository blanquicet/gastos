# CLAUDE_AUTH_PHASE.md — Gastos App (Auth-only Phase)

This file is the single source of truth for AI assistants (Claude in VS Code) working on this repository.

If any suggestion conflicts with this document, this document wins.

---

## 1) Current phase goal

**IMPORTANT: This phase is AUTH ONLY.**

- Implement authentication and session management.
- Force login before registering movements.
- Keep the existing **Excel + n8n** pipeline unchanged.
- Do **not** migrate movements to a database yet.
- Use **Azure PostgreSQL** for authentication data.
- Do **not** introduce Supabase (managed or self-hosted) in this phase.
- n8n will disappear later, but **not** now.

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

```
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

### 8.2 Minimal schema (conceptual)

- users
  - id (uuid, primary key)
  - email (text, unique, not null)
  - password_hash (text, not null)
  - created_at (timestamptz)

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

---

## 9) Security requirements

- Password hashing: argon2id preferred (bcrypt acceptable)
- Tokens stored hashed, never plaintext
- Constant-time comparisons
- No auth logic in n8n
- No secrets in frontend
- Basic rate limiting on auth endpoints

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

1) deploy-swa.yml
- Triggers on `frontend/**`
- Deploys Azure Static Web App

2) deploy-api.yml
- Triggers on `backend/**`
- Builds and deploys Go API

Do not combine these workflows.

---

## 12) First message for a new Claude chat

Use the context from `.github/CLAUDE_AUTH_PHASE.md` and start by designing the Go authentication API skeleton aligned with this document.
