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

variable "api_location" {
  description = "Azure region for Container Apps API (closer to users = lower latency)"
  type        = string
  default     = "brazilsouth"
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

variable "email_provider" {
  description = "Email provider: noop, smtp, sendgrid, or resend"
  type        = string
  default     = "noop"
}

variable "email_api_key" {
  description = "Email service API key (for sendgrid or resend)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "email_from_address" {
  description = "Email sender address"
  type        = string
  default     = "noreply@conti.blanquicet.com.co"
}

variable "email_from_name" {
  description = "Email sender name"
  type        = string
  default     = "Conti"
}

variable "email_base_url" {
  description = "Base URL for email links (frontend URL)"
  type        = string
  default     = "https://conti.blanquicet.com.co"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    project     = "conti"
    environment = "production"
    managed_by  = "terraform"
  }
}

# =============================================================================
# Azure OpenAI Variables
# =============================================================================

variable "openai_location" {
  description = "Azure region for OpenAI resource (must have OpenAI model quota)"
  type        = string
  default     = "eastus"
}

variable "azure_openai_chat_deployment" {
  description = "Deployment name for the chat model"
  type        = string
  default     = "gpt-4.1-mini"
}

variable "openai_chat_model_name" {
  description = "OpenAI model name for chat"
  type        = string
  default     = "gpt-4.1-mini"
}

variable "openai_chat_model_version" {
  description = "OpenAI model version for chat"
  type        = string
  default     = "2025-04-14"
}

variable "openai_chat_capacity" {
  description = "Token-per-minute capacity (in thousands) for chat deployment"
  type        = number
  default     = 10
}

variable "azure_openai_api_version" {
  description = "Azure OpenAI API version"
  type        = string
  default     = "2024-10-21"
}

# Embeddings (optional)

variable "openai_embeddings_enabled" {
  description = "Whether to create an embeddings deployment"
  type        = bool
  default     = false
}

variable "azure_openai_embeddings_deployment" {
  description = "Deployment name for the embeddings model"
  type        = string
  default     = "text-embedding-3-small"
}

variable "openai_embeddings_model_name" {
  description = "OpenAI model name for embeddings"
  type        = string
  default     = "text-embedding-3-small"
}

variable "openai_embeddings_model_version" {
  description = "OpenAI model version for embeddings"
  type        = string
  default     = "1"
}

variable "openai_embeddings_capacity" {
  description = "Token-per-minute capacity (in thousands) for embeddings deployment"
  type        = number
  default     = 10
}

# =============================================================================
# Azure Speech (for STT)
# =============================================================================

variable "speech_location" {
  description = "Azure region for Speech Services (same as API for low latency)"
  type        = string
  default     = "brazilsouth"
}

variable "speech_language" {
  description = "Language for speech recognition"
  type        = string
  default     = "es-CO"
}
