# Gastos Backend

Go API backend for the Gastos application, handling authentication, sessions, and business logic.

## Tech Stack

- **Language:** Go 1.24+
- **Database:** PostgreSQL 16
- **Auth:** Session-based with HttpOnly cookies
- **Email:** SMTP (dev) / Resend (production)
- **Deployment:** Azure Container Apps

## Project Structure

```
backend/
├── cmd/
│   └── api/           # Application entrypoint
├── internal/
│   ├── auth/          # Authentication logic
│   ├── config/        # Configuration management
│   ├── email/         # Email service (SMTP, Resend)
│   ├── httpserver/    # HTTP server setup
│   ├── middleware/    # HTTP middleware
│   ├── movements/     # Movements CRUD operations
│   ├── sessions/      # Session management
│   └── users/         # User management
├── migrations/        # Database migrations
├── .env.example       # Environment variables template
├── docker-compose.yml # Local PostgreSQL setup
└── Dockerfile         # Production container image
```

## Quick Start

### Prerequisites

- Go 1.24+
- Docker & Docker Compose (for PostgreSQL)
- golang-migrate CLI (for database migrations)

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work out of the box)
```

### 3. Run Migrations

```bash
export DB_URL="postgres://gastos:gastos_dev_password@localhost:5432/gastos?sslmode=disable"
migrate -path ./migrations -database "$DB_URL" up
```

### 4. Run the Server

```bash
go run cmd/api/main.go
```

Server starts on `http://localhost:8080`

## Email Configuration

The backend supports three email providers for password reset functionality.

### Development: No-Op (Default)

Emails are logged to console instead of being sent. Perfect for local development.

```bash
# .env
EMAIL_PROVIDER=noop
```

### Local Testing: SMTP

Use any SMTP server for testing email delivery locally. For example, use [Mailtrap](https://mailtrap.io):

1. Sign up at [mailtrap.io](https://mailtrap.io) (free)
2. Get SMTP credentials from your inbox
3. Configure `.env`:

```bash
EMAIL_PROVIDER=smtp
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USERNAME=your-mailtrap-username
SMTP_PASSWORD=your-mailtrap-password
EMAIL_FROM_ADDRESS=noreply@gastos.blanquicet.com.co
EMAIL_FROM_NAME=Gastos
EMAIL_BASE_URL=http://localhost:8080
```

### Production: Resend

Recommended for production deployments.

#### Setup

1. **Create Resend Account**
   - Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month)

2. **Generate API Key**
   - Go to API Keys section in dashboard
   - Create API Key
   - Copy the key (starts with `re_...`)

3. **Add API Key to GitHub Secrets**

   **⚠️ NEVER commit API keys to `.env` or code!**

   Using the GitHub CLI:

   ```bash
   gh secret set EMAIL_API_KEY --body "re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   ```

   Or manually via web UI:
   - Go to GitHub repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `EMAIL_API_KEY`
   - Value: `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Click "Add secret"

4. **Terraform Will Automatically Configure Azure**

   The `.github/workflows/terraform.yml` workflow automatically:

   - Reads `EMAIL_API_KEY` from GitHub Secrets
   - Passes it to Terraform via `TF_VAR_email_api_key`
   - Creates `email-api-key` secret in Azure Container Apps
   - Sets all email environment variables

5. **Verify Sender Domain (Optional)**

   Resend allows sending from your verified domain for better deliverability:

   - Go to Domains section in Resend dashboard
   - Add your domain (`blanquicet.com.co`)
   - Add DNS records to Cloudflare (DKIM, SPF, DMARC)
   - Resend will provide specific records for verification

   Note: You can send emails immediately without domain verification, but verifying improves deliverability.

6. **Test Email Sending**

```bash
# Trigger password reset
curl -X POST http://localhost:8080/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"your-test@email.com"}'

# Check Resend Activity Dashboard for delivery status
```

## API Endpoints

### Health Check

```
GET /health
GET /version
```

### Authentication

```
POST /auth/register       # Register new user
POST /auth/login          # Login
POST /auth/logout         # Logout
GET  /me                  # Get current user
POST /auth/forgot-password   # Request password reset
POST /auth/reset-password    # Reset password with token
```

### Movements

```
GET  /movements        # List movements (with filters)
POST /movements        # Create movement
GET  /movements/{id}   # Get movement by ID
PATCH /movements/{id}  # Update movement
DELETE /movements/{id} # Delete movement
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | *required* |
| `SERVER_ADDR` | Server listen address | `:8080` |
| `SESSION_COOKIE_NAME` | Session cookie name | `gastos_session` |
| `SESSION_COOKIE_SECURE` | Use secure cookies (HTTPS only) | `true` (prod), `false` (dev) |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | - |
| `STATIC_DIR` | Static files directory (for local dev) | - |
| **Email Configuration** | | |
| `EMAIL_PROVIDER` | Email provider: `noop`, `smtp`, `resend` | `noop` |
| `EMAIL_FROM_ADDRESS` | Sender email address | `noreply@gastos.blanquicet.com.co` |
| `EMAIL_FROM_NAME` | Sender name | `Gastos` |
| `EMAIL_BASE_URL` | Frontend base URL for email links | `http://localhost:8080` |
| **SMTP Configuration** | | |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USERNAME` | SMTP authentication username | - |
| `SMTP_PASSWORD` | SMTP authentication password | - |
| **Email Provider API Key** | | |
| `EMAIL_API_KEY` | Email service API key (Resend, SendGrid, etc.) | - |

## Testing

```bash
# Run all tests
go test ./...

# Run with coverage
go test -cover ./...

# Run with race detection
go test -race ./...
```

## Database Migrations

```bash
# Apply all migrations
migrate -path ./migrations -database "$DB_URL" up

# Rollback last migration
migrate -path ./migrations -database "$DB_URL" down 1

# Check current version
migrate -path ./migrations -database "$DB_URL" version
```

## Deployment

The backend is automatically deployed to Azure Container Apps via GitHub Actions when changes are pushed to the `main` branch.

See `../.github/workflows/deploy-api.yml` and `../infra/README.md` for details.

## Security Notes

- Passwords are hashed using Argon2id
- Sessions are stored server-side (PostgreSQL)
- Session cookies are HttpOnly and Secure (in production)
- Rate limiting on authentication endpoints:
  - Login/Register: 5 requests/minute per IP
  - Password reset: 3 requests/minute per IP
- Password reset tokens expire after 1 hour
- Email enumeration protection (doesn't reveal if email exists)

## Troubleshooting

### Email not sending (SMTP)

```bash
# Check SMTP credentials
echo $SMTP_USERNAME
echo $SMTP_HOST

# Test SMTP connection
telnet $SMTP_HOST $SMTP_PORT

# Check logs
# Server will log SMTP errors with detailed information
```

### Email not sending

```bash
# Verify API key is set
echo $EMAIL_API_KEY | cut -c1-10
# Resend keys start with: re_
# SendGrid keys start with: SG.

# Check Resend dashboard (if using Resend)
https://resend.com/emails

# Common issues:
# - API key invalid or expired
# - Domain not verified (optional for Resend)
# - Daily/monthly limit reached
```

### Database connection issues

```bash
# Verify PostgreSQL is running
docker compose ps

# Test connection
psql "$DB_URL" -c "SELECT 1;"

# Check logs
docker compose logs postgres
```

## License

See [LICENSE](../LICENSE) for details.
