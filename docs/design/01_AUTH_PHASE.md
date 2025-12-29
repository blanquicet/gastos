# CLAUDE_AUTH_PHASE.md — Gastos App (Auth-only Phase)

This file is the single source of truth for AI assistants (Claude in VS Code) working on this repository.

If any suggestion conflicts with this document, this document wins.

---

## 1) Current phase goal

**IMPORTANT: This phase is AUTH ONLY.** ✅ COMPLETED

- ✅ Implement authentication and session management.
- ✅ Force login before registering movements.
- ✅ Password reset flow (forgot password + email delivery).
- ✅ Keep the existing **Google Sheets + n8n** pipeline unchanged.
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
- Cloudflare DNS must be **DNS-only** (not proxied)

**Cloudflare DNS Configuration:**

```text
Type   Name    Target                    Proxy Status
CNAME  gastos  <Static Web App FQDN>     DNS only
```

**Important:**

- Azure Static Web Apps requires DNS-only mode. If proxied through Cloudflare, the custom domain verification and SSL setup will fail.
- No TXT record needed - SWA verifies domain ownership through the CNAME record itself.

### 4.2 Backend API (Go)

- Written in Go
- Deployed to **Azure Container Apps**
- Served at:
  - `https://api.gastos.blanquicet.com.co`

**Cloudflare DNS Configuration:**

```text
Type   Name              Target                          Proxy Status
CNAME  api.gastos        <Container App FQDN>            DNS only
TXT    asuid.api.gastos  <Azure verification token>      DNS only
```

**Notes:**

- CNAME points to the Container App's default FQDN
- TXT record (`asuid.api.gastos`) is required for Azure custom domain verification (Container Apps security requirement, unlike SWA which verifies via CNAME alone)
- DNS-only mode required for Azure to manage SSL certificates

Frontend must only talk to the backend API.

---

## 5) Existing system (must remain working)

- n8n runs on a VM behind Caddy.
- n8n writes movements to a Google Sheets ledger.
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

## 8) CORS Configuration and Domain Architecture

### 8.1 Current Architecture: Separate Domains

The application currently uses separate domains for frontend and backend:

- **Frontend:** `https://gastos.blanquicet.com.co` (Azure Static Web Apps)
- **Backend:** `https://api.gastos.blanquicet.com.co` (Azure Container Apps)

**Why CORS is required:**

This cross-origin architecture requires CORS (Cross-Origin Resource Sharing) configuration for two reasons:

1. **Browser Security:** Browsers block JavaScript requests from one domain to another by default (Same-Origin Policy). Without CORS headers, all frontend API calls would fail.

2. **Credentials with Cookies:** To send session cookies in cross-origin requests, both sides must cooperate:
   - **Frontend:** `credentials: "include"` in fetch calls
   - **Backend:** CORS headers allowing the origin and credentials:
     - `Access-Control-Allow-Origin: https://gastos.blanquicet.com.co`
     - `Access-Control-Allow-Credentials: true`

**Current CORS implementation:**

```go
// backend/internal/middleware/middleware.go
func CORS(allowedOrigins string) func(http.Handler) http.Handler {
    origins := strings.Split(allowedOrigins, ",")
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            origin := r.Header.Get("Origin")
            for _, allowed := range origins {
                if strings.TrimSpace(allowed) == origin {
                    w.Header().Set("Access-Control-Allow-Origin", origin)
                    w.Header().Set("Access-Control-Allow-Credentials", "true")
                    w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
                    break
                }
            }
            if r.Method == "OPTIONS" {
                w.WriteHeader(http.StatusOK)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}
```

**Environment configuration:**

```bash
# For local development (recommended setup)
# CORS not needed - backend serves frontend at same origin (http://localhost:8080)
# STATIC_DIR=../frontend/registrar-movimiento
# Only set ALLOWED_ORIGINS if running frontend separately:
# ALLOWED_ORIGINS=http://localhost:8000

# For production (configured via GitHub Secret → Terraform → Container Apps)
ALLOWED_ORIGINS=https://gastos.blanquicet.com.co
```

**Local development notes:**

- **Recommended setup:** Backend serves frontend static files (`STATIC_DIR=../frontend/registrar-movimiento`)
  - No CORS needed - same origin (http://localhost:8080)
  - Frontend calls `/me`, `/auth/login`, etc. (relative URLs)
  - Simplest configuration

- **Alternative setup:** Run frontend separately (e.g., `python3 -m http.server 8000`)
  - Requires `ALLOWED_ORIGINS=http://localhost:8000`
  - Frontend runs on different port than backend
  - Only use for specific testing scenarios

See `backend/.env.example` and `docs/DEVELOPMENT.md` for complete local setup.

**Security considerations:**

- CORS provides **light protection** against malicious websites making authenticated requests
- It does **not** prevent direct API calls via curl, Postman, or scripts
- It only controls which web origins can make requests from browsers
- Acts as basic CSRF (Cross-Site Request Forgery) protection

### 8.2 Alternative Architecture: Same Domain (Future Enhancement)

**Proposed architecture:**

- **Frontend:** `https://gastos.blanquicet.com.co/`
- **Backend:** `https://gastos.blanquicet.com.co/api/*`

**Advantages:**

1. **No CORS needed** - Same-origin requests work automatically
2. **Simpler cookie handling** - No cross-origin cookie restrictions
3. **Cleaner architecture** - Single domain, unified experience
4. **Better SEO** - All content under one domain
5. **Reduced configuration** - No CORS headers to manage

**Disadvantages:**

1. **Requires routing layer** - Need additional infrastructure
2. **More complex deployment** - Two services behind one domain
3. **Additional costs** - Front Door or Application Gateway required

**Azure Solutions for Implementation:**

#### Option 1: Azure Front Door

**What it is:** Global CDN and application delivery service with advanced routing

**Features:**

- Global CDN with edge locations
- SSL/TLS termination
- Web Application Firewall (WAF)
- DDoS protection
- Health probes and automatic failover
- Request/response transformations

**Cost:** ~$35/month (Standard tier)

#### Option 2: Azure Application Gateway

**What it is:** Regional load balancer with application-level routing

**Features:**

- Layer 7 load balancing
- SSL/TLS termination
- URL-based routing
- Web Application Firewall (WAF)
- Regional deployment (lower latency for specific region)

**Cost:** ~$145/month (Standard_v2 tier)

#### Option 3: Azure API Management

**What it is:** Full API management platform with gateway capabilities

**Features:**

- API versioning and documentation
- Rate limiting and quotas
- Request/response transformations
- Analytics and monitoring
- Developer portal

**Cost:** Pay-per-use (Consumption tier) or ~$50/month (Developer tier)

### 8.3 Recommendation

**Current approach (separate domains + CORS) is the right long-term solution:**

1. **Cost:** $0 extra infrastructure (aligns with pay-per-use philosophy)
2. **Simplicity:** No additional services, no migration complexity
3. **Performance:** CORS overhead is negligible (<1ms per request)
4. **Scalability:** Works fine even with hundreds of users
5. **Maintainability:** Fewer moving parts, easier to debug

**Cost analysis of same-domain alternatives:**

| Solution                           | Monthly Cost              | Makes Sense When                         |
| ---------------------------------- | ------------------------- | ---------------------------------------- |
| **Current (CORS)**                 | $0                        | Always (recommended)                     |
| Azure API Management (Consumption) | ~$3.50 per million calls  | Need API versioning, analytics, quotas   |
| Azure Front Door (Standard)        | ~$35 base + traffic       | Need global CDN, WAF, DDoS protection    |
| Azure Application Gateway (v2)     | ~$145 base + traffic      | Need regional load balancing, WAF        |

**When to reconsider same-domain architecture:**

1. **Specific feature needs:**
   - API versioning and lifecycle management → API Management
   - Global CDN for international users → Front Door
   - Advanced WAF/DDoS protection → Front Door or App Gateway

2. **Not because of scale or CORS overhead** - CORS is not a bottleneck

**Reality check:**

- 2 users, ~100 requests/day = **CORS is free and fast**
- Even 100 users, ~10,000 requests/day = **CORS still free and fast**
- API Management Consumption: $3.50 per million calls = minimal cost but added complexity
- You'd be paying (in maintenance burden) for features you don't need

**Recommended approach:**

1. ✅ Keep current CORS setup (already implemented)
2. ✅ Monitor actual needs, not theoretical scalability
3. ✅ Only add routing layer when you need its specific features (versioning, analytics, WAF)
4. ✅ Prioritize pay-per-use alignment over architectural purity

---

## 9) Database decision (AUTH ONLY)

**Decision: Use Azure Database for PostgreSQL (Flexible Server).**

This database is used **only** for authentication data in this phase.
Movements remain in Google Sheets via n8n.

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

### 9.1 Password Hashing Performance Optimization (Dec 2024)

Argon2id parameters were optimized for Azure Container Apps limited resources (0.25 CPU, 0.5Gi RAM):

**Current parameters:**

- Memory: 19 MB (OWASP recommended for interactive systems)
- Iterations: 2
- Threads: 1
- Key length: 32 bytes

**Previous parameters (caused slow login):**

- Memory: 64 MB (too high for 512MB container)
- Iterations: 1
- Threads: 4

**Impact:**

Login performance improved from ~5-10 seconds to <1 second while maintaining strong security. With 19MB per operation, the 512MB container can handle ~25 concurrent login/register operations comfortably.

**Note:** Container App resources (0.25 CPU, 0.5Gi RAM) were kept at minimum tier since the app only has 2 users currently. If user base grows, consider scaling resources instead of reducing Argon2 security parameters.

---

## 10) Explicit non-goals for this phase

Do not:

- Migrate Google Sheets to DB
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

## 14) Pending Auth Features (Not Yet Implemented)

### 14.1 Password Reset Flow ✅ COMPLETED AND DEPLOYED

**Status:**

- ✅ Backend endpoints implemented and deployed to production
- ✅ Database schema ready (`password_resets` table)
- ✅ Frontend UI implemented and deployed
- ✅ Email sending implemented with Resend (production) and Mailtrap (local testing)

**Backend endpoints already available:**

- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token

**What was implemented:**

1. **Email Service Integration** ✅ DONE

   - **Decision:** Resend (recommended production provider)
   - **Rationale:**
     - Better free tier (3,000 emails/month vs 100/day)
     - Simpler setup than Azure Communication Services
     - Excellent Go SDK and documentation
     - Modern, developer-friendly API
     - No DNS complexity for initial setup
     - Provider-agnostic implementation
   - **Implementations:**
     - `NoOpSender`: Logs emails to console (development)
     - `SMTPSender`: SMTP for local testing (Mailtrap, Gmail)
     - `ResendSender`: Production email delivery (recommended)
     - `SendGridSender`: Alternative production option
   - **Configuration:** Environment variable-based provider selection
   - **Documentation:** See `backend/README.md` and `docs/DEVELOPMENT.md`

2. **Frontend Implementation** ✅ COMPLETED

   - ✅ "Forgot Password?" link in login form (`/login`)
   - ✅ Forgot password form at `/forgot-password` (email input)
   - ✅ Reset password page at `/reset-password?token=xxx`
   - ✅ Form with new password + confirmation validation
   - ✅ Backend endpoints integration
   - ✅ Success/error messages in Spanish
   - ✅ Auto-redirect after successful reset (10 seconds)
   - ✅ Centralized API_URL configuration

3. **Email Template** ✅ DONE

   - Subject: "Restablecer contraseña - Gastos"
   - HTML template with Spanish content
   - Link format: `https://gastos.blanquicet.com.co/reset-password?token={token}`
   - Includes expiration notice (1 hour)
   - Responsive design for mobile/desktop

4. **Environment Variables** ✅ DONE

   **Local Development (.env):**
   ```bash
   # Development (no-op, logs only)
   EMAIL_PROVIDER=noop
   EMAIL_FROM_ADDRESS=noreply@gastos.blanquicet.com.co
   EMAIL_FROM_NAME=Gastos
   EMAIL_BASE_URL=http://localhost:8080

   # Local testing with Mailtrap (SMTP)
   EMAIL_PROVIDER=smtp
   SMTP_HOST=sandbox.smtp.mailtrap.io
   SMTP_PORT=587
   SMTP_USERNAME=your-mailtrap-username
   SMTP_PASSWORD=your-mailtrap-password
   EMAIL_FROM_ADDRESS=noreply@gastos.blanquicet.com.co
   EMAIL_FROM_NAME=Gastos
   EMAIL_BASE_URL=http://localhost:8080
   ```

   **Production (GitHub Secrets + Terraform):**
   ```bash
   # Add to GitHub repository secrets:
   # Repository → Settings → Secrets → Actions
   # Name: EMAIL_API_KEY
   # Value: re_your-resend-api-key

   # Terraform automatically configures Container Apps with:
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=secretref:email-api-key  # From GitHub Secret
   EMAIL_FROM_ADDRESS=noreply@gastos.blanquicet.com.co
   EMAIL_FROM_NAME=Gastos
   EMAIL_BASE_URL=https://gastos.blanquicet.com.co
   ```

   **⚠️ Security Note:**
   - Never commit `EMAIL_API_KEY` to `.env` or code!
   - Local: Use `noop` or Mailtrap (SMTP)
   - Production: GitHub Secrets → Terraform → Azure Container Apps

5. **Testing** ✅ TESTED AND VERIFIED

   - ✅ Token generation (verified in production)
   - ✅ Email delivery with Resend (production)
   - ✅ Email delivery with Mailtrap (local testing)
   - ✅ Token expiration (1 hour)
   - ✅ Token invalidation after use
   - ✅ Password confirmation validation (server-side)
   - ✅ Non-existent email handling (security: no enumeration)
   - ✅ Security: tokens not logged (only email tracking)
   - ✅ Security: WARN logs for non-existent email attempts
   - ✅ Complete flow tested in production

**Estimated effort for remaining work:** None - fully implemented and deployed! ✅

**Deployed Components:**
- ✅ Backend API running on Azure Container Apps
- ✅ Frontend UI deployed on Azure Static Web Apps
- ✅ Resend email service configured with GitHub Secrets
- ✅ Production tested and verified
- ✅ Security hardening completed (no token logging, enumeration prevention)


### 14.2 Email Verification (Not Implemented)

**Status:** Not started - requires database schema changes

**Purpose:**

Verify user email addresses to prevent fake accounts and improve security.

**What needs to be done:**

1. **Database Schema Changes**

   New migration: `005_add_email_verification.up.sql`

   ```sql
   ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE users ADD COLUMN email_verification_token TEXT;
   ALTER TABLE users ADD COLUMN email_verification_expires_at TIMESTAMPTZ;

   CREATE INDEX idx_users_verification_token ON users(email_verification_token)
   WHERE email_verification_token IS NOT NULL;
   ```

2. **Backend Changes**

   - Update `User` model with verification fields
   - Modify registration flow:
     - Create user with `email_verified=false`
     - Generate verification token (UUID or secure random)
     - Store hashed token in database
     - Send verification email
     - **Do NOT auto-login** after registration
   - New endpoint: `GET /auth/verify-email?token=xxx`
     - Validate token and expiration
     - Mark `email_verified=true`
     - Clear verification token
     - Optional: create session (auto-login)
   - New endpoint: `POST /auth/resend-verification`
     - For users who didn't receive email
     - Rate limit: 1 request per 5 minutes
   - Update middleware:
     - Check `email_verified=true` for protected routes
     - Or allow limited access with verification banner

3. **Frontend Changes**

   - Update registration flow:
     - After registration, show: "Check your email to activate your account"
     - Do NOT redirect to app
   - Create verification page: `/verify-email?token=xxx`
     - Auto-verify on page load
     - Show success message
     - Redirect to login (or auto-login)
   - Add "Resend verification email" link
     - Show if user tries to login with unverified email
   - Optional: Verification banner
     - If allowing app access before verification
     - "Please verify your email to continue using all features"

4. **Email Templates**

   **Welcome/Verification Email:**

   - Subject: "Bienvenido a Gastos - Verifica tu email"
   - Body: HTML template with verification link
   - Link: `https://gastos.blanquicet.com.co/verify-email?token={token}`
   - Expiration: 24 hours
   - Include "Resend verification" link in email

5. **User Flow Changes**

   **Current flow (implemented):**

   ```
   Register → Auto-login → App
   ```

   **New flow (after implementation):**

   ```
   Register → "Check email" message
   User clicks email link → Account verified → Login → App
   ```

   **If user tries to login before verification:**

   ```
   Login attempt → Show error: "Please verify your email first"
   → Show "Resend verification email" button
   ```

6. **Edge Cases to Handle**

   - User registers with already-verified email (prevent)
   - Token expired (allow resend)
   - Token already used (show message)
   - User changes email later (require re-verification)
   - Cleanup: Delete unverified accounts after X days (optional background job)

7. **Environment Variables**

   Same email service as password reset.

   Additional config:

   ```bash
   EMAIL_VERIFICATION_EXPIRY=24h
   EMAIL_VERIFICATION_RESEND_COOLDOWN=5m
   ```

8. **Security Considerations**

   - Store verification tokens hashed (like password reset tokens)
   - Use constant-time comparison for token validation
   - Rate limit resend endpoint (prevent spam)
   - Prevent email enumeration (always return success on resend)

**Estimated effort:** 4-6 hours

**Recommended approach:** Implement after password reset is working

### 14.3 Email Service Infrastructure ✅ IMPLEMENTED

**Implemented solution: Provider-agnostic email with Resend**

**Why Resend:**

- Better free tier: 3,000 emails/month (vs 100/day for SendGrid/Azure)
- Simpler setup than Azure Communication Services
- Excellent Go SDK and documentation
- Modern, developer-friendly API
- Good deliverability and email reputation
- No vendor lock-in (provider-agnostic implementation)

**Implementation:**

Email providers implemented (easily extensible):

1. **NoOpSender** (default for development)
   - Logs emails to console
   - No actual email sending
   - Perfect for local development

2. **SMTPSender** (for local testing)
   - Standard SMTP protocol
   - Works with any SMTP server
   - Recommended for local email testing:
     - Mailtrap (fake SMTP server)
     - Gmail (with App Password)
     - Any corporate SMTP server

3. **ResendSender** (recommended for production)
   - Production-ready email delivery
   - 3,000 emails/month free tier
   - Simple API
   - Good deliverability

4. **SendGridSender** (alternative production option)
   - Also supported as fallback
   - 100 emails/day free tier

**Configuration:**

Provider selection via environment variable:

```bash
EMAIL_PROVIDER=noop    # Development (logs only)
EMAIL_PROVIDER=smtp    # Local testing (SMTP)
EMAIL_PROVIDER=resend  # Production (Resend - recommended)
EMAIL_PROVIDER=sendgrid # Production (SendGrid - alternative)
```

**Resend Setup for Production:**

1. **Create Resend Account**

   ```bash
   # Sign up at resend.com (free tier: 3,000 emails/month)
   ```

2. **Generate API Key**

   ```bash
   # Go to API Keys section
   # Create new API Key
   # Copy the key (starts with re_...)
   ```

3. **Add to GitHub Secrets**

   ```bash
   # Using GitHub CLI (recommended)
   gh secret set EMAIL_API_KEY --body "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

   # Or manually: Repository → Settings → Secrets → Actions
   # Name: EMAIL_API_KEY
   # Value: re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

4. **Terraform Handles the Rest**

   ```bash
   # Automatically configures:
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=secretref:email-api-key
   EMAIL_FROM_ADDRESS=noreply@gastos.blanquicet.com.co
   EMAIL_FROM_NAME=Gastos
   EMAIL_BASE_URL=https://gastos.blanquicet.com.co
   ```

5. **Domain Verification**
   - Go to Domains section in Resend dashboard
   - Add `gastos.blanquicet.com.co`
   - Add DNS records to Cloudflare (DKIM, SPF, DMARC)
   - Resend provides specific records
   - Note: Can send emails immediately without verification

**Alternative: Azure Communication Services** (not implemented)

If needed in the future, Azure Communication Services could be added:

- Requires Terraform infrastructure setup
- Native Azure integration
- Free tier: 100 emails/day
- See previous version of this document for implementation details

**Cost:** Free tier sufficient for current usage (2 users, minimal password resets)

**Documentation:**

- `backend/README.md` - Detailed email setup guide
- `docs/DEVELOPMENT.md` - Local testing with SMTP
- `backend/.env.example` - Configuration examples

---

## 15) Next Steps After Auth Phase

Once email verification is implemented, the auth phase will be complete.

**Future enhancements (out of scope for auth phase):**

- User profile management (update name, email, password)
- Two-factor authentication (2FA)
- OAuth integration (Google, Microsoft)
- Session management (view/revoke active sessions)
- Account deletion

**Current focus should shift to:**

Connecting the movement registration form to the authenticated backend and migrating from Google Sheets + n8n to database storage.

---

## 16) First message for a new Claude chat

### For implementing pending auth features

Use the context from `.github/CLAUDE_AUTH_PHASE.md` section 14 to implement:

**For Password Reset Frontend:**

1. Read section 14.1 for complete requirements
2. Backend endpoints are already implemented (`POST /auth/forgot-password`, `POST /auth/reset-password`)
3. Implement email sender using Azure Communication Services (section 14.3)
4. Create frontend forms for forgot password flow
5. Test with real email delivery

**For Email Verification:**

1. Read section 14.2 for complete requirements
2. Create migration 005 for email verification fields
3. Update User model and repository
4. Modify registration flow to NOT auto-login
5. Implement verification endpoint and email sending
6. Update frontend registration flow
7. Test complete verification flow

### For new features (post-auth):

The PostgreSQL database is already running at `gastos-auth-postgres.postgres.database.azure.com` with database `gastos_auth`. Authentication system is complete and deployed. Focus on integrating movement registration with the authenticated backend.

---
