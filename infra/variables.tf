# =============================================================================
# Variables
# =============================================================================

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  default     = "0f6b14e8-ade9-4dc5-9ef9-d0bcbaf5f0d8"
}

variable "tenant_id" {
  description = "Azure tenant ID"
  type        = string
  default     = "9de9ca20-a74e-40c6-9df8-61b9e313a5b3"
}

variable "resource_group_name" {
  description = "Name of the existing resource group"
  type        = string
  default     = "gastos-rg"
}

variable "postgres_server_name" {
  description = "Name of the PostgreSQL Flexible Server (must be globally unique)"
  type        = string
  default     = "gastos-auth-postgres"
}

variable "postgres_admin_username" {
  description = "Administrator username for PostgreSQL"
  type        = string
  default     = "gastosadmin"
}

variable "postgres_database_name" {
  description = "Name of the authentication database"
  type        = string
  default     = "gastos_auth"
}

variable "postgres_location" {
  description = "Azure region for PostgreSQL (may differ from RG due to quota restrictions)"
  type        = string
  default     = "brazilsouth"
}

variable "dev_ip_address" {
  description = "Your development machine IP for firewall rule (leave empty to skip)"
  type        = string
  default     = ""
}

variable "allowed_origins" {
  description = "Comma-separated allowed origins for CORS (set via TF_VAR_allowed_origins in CI/CD)"
  type        = string
  default     = ""
}

variable "n8n_webhook_url" {
  description = "n8n webhook URL for movement registration (set via TF_VAR_n8n_webhook_url in CI/CD)"
  type        = string
  default     = ""
}

variable "n8n_api_key" {
  description = "n8n API key for authentication (set via TF_VAR_n8n_api_key in CI/CD)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "email_provider" {
  description = "Email provider: noop, smtp, or sendgrid (set via TF_VAR_email_provider in CI/CD)"
  type        = string
  default     = "noop"
}

variable "sendgrid_api_key" {
  description = "SendGrid API key for production email (set via TF_VAR_sendgrid_api_key in CI/CD)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "email_from_address" {
  description = "Email sender address"
  type        = string
  default     = "noreply@gastos.blanquicet.com.co"
}

variable "email_from_name" {
  description = "Email sender name"
  type        = string
  default     = "Gastos"
}

variable "email_base_url" {
  description = "Base URL for email links (frontend URL)"
  type        = string
  default     = "https://gastos.blanquicet.com.co"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    project     = "gastos"
    environment = "production"
    managed_by  = "terraform"
  }
}
