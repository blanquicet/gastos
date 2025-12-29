# =============================================================================
# Gastos App - Infrastructure (Terraform)
# =============================================================================
# This configuration manages Azure resources for the Gastos app.
# Phase 1: PostgreSQL for authentication only.
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state - stored in Azure Storage
  backend "azurerm" {
    resource_group_name  = "gastos-rg"
    storage_account_name = "gastostfstate"
    container_name       = "tfstate"
    key                  = "gastos.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

# =============================================================================
# Data Sources - Reference existing resources (not managed by Terraform)
# =============================================================================

data "azurerm_resource_group" "gastos" {
  name = var.resource_group_name
}

# =============================================================================
# Random password for PostgreSQL admin
# =============================================================================

resource "random_password" "postgres_admin" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# =============================================================================
# PostgreSQL Flexible Server (for authentication data)
# =============================================================================

resource "azurerm_postgresql_flexible_server" "auth" {
  name                = var.postgres_server_name
  resource_group_name = data.azurerm_resource_group.gastos.name
  location            = var.postgres_location # Different from RG due to quota restrictions

  # Credentials
  administrator_login    = var.postgres_admin_username
  administrator_password = random_password.postgres_admin.result

  # SKU - Burstable B1ms (cost-effective for auth workload)
  sku_name = "B_Standard_B1ms"

  # Storage
  storage_mb = 32768 # 32 GB minimum

  # Version
  version = "16"

  # Backup
  backup_retention_days        = 7
  geo_redundant_backup_enabled = false

  # Network - Public access (with firewall rules)
  # For production, consider private endpoint
  public_network_access_enabled = true

  # Zone (no HA for burstable tier)
  zone = "1"

  tags = var.tags
}

# =============================================================================
# PostgreSQL Database
# =============================================================================

resource "azurerm_postgresql_flexible_server_database" "auth" {
  name      = var.postgres_database_name
  server_id = azurerm_postgresql_flexible_server.auth.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# =============================================================================
# Firewall Rules
# =============================================================================

# Allow Azure services (needed for Azure Container Apps, Functions, etc.)
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.auth.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Allow your current IP for local development (optional, update as needed)
resource "azurerm_postgresql_flexible_server_firewall_rule" "dev_ip" {
  count            = var.dev_ip_address != "" ? 1 : 0
  name             = "AllowDevIP"
  server_id        = azurerm_postgresql_flexible_server.auth.id
  start_ip_address = var.dev_ip_address
  end_ip_address   = var.dev_ip_address
}

# =============================================================================
# PostgreSQL Configuration (security hardening)
# =============================================================================

resource "azurerm_postgresql_flexible_server_configuration" "require_ssl" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.auth.id
  value     = "ON"
}

resource "azurerm_postgresql_flexible_server_configuration" "log_connections" {
  name      = "log_connections"
  server_id = azurerm_postgresql_flexible_server.auth.id
  value     = "ON"
}

# =============================================================================
# Azure Container Apps (Backend API)
# =============================================================================

resource "azurerm_log_analytics_workspace" "api" {
  name                = "gastos-api-logs"
  location            = data.azurerm_resource_group.gastos.location
  resource_group_name = data.azurerm_resource_group.gastos.name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = var.tags
}

resource "azurerm_container_app_environment" "api" {
  name                       = "gastos-api-env"
  location                   = data.azurerm_resource_group.gastos.location
  resource_group_name        = data.azurerm_resource_group.gastos.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.api.id

  tags = var.tags
}

resource "azurerm_container_app" "api" {
  name                         = "gastos-api"
  container_app_environment_id = azurerm_container_app_environment.api.id
  resource_group_name          = data.azurerm_resource_group.gastos.name
  revision_mode                = "Single"

  template {
    min_replicas = 0
    max_replicas = 2

    container {
      name   = "api"
      image  = "ghcr.io/blanquicet/gastos/api:latest"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name  = "SERVER_ADDR"
        value = ":8080"
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      env {
        name  = "SESSION_COOKIE_SECURE"
        value = "true"
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }

      env {
        name  = "N8N_WEBHOOK_URL"
        value = var.n8n_webhook_url
      }

      env {
        name  = "N8N_API_KEY"
        value = var.n8n_api_key
      }

      env {
        name  = "EMAIL_PROVIDER"
        value = var.email_provider
      }

      env {
        name  = "EMAIL_FROM_ADDRESS"
        value = var.email_from_address
      }

      env {
        name  = "EMAIL_FROM_NAME"
        value = var.email_from_name
      }

      env {
        name  = "EMAIL_BASE_URL"
        value = var.email_base_url
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  dynamic "secret" {
    for_each = var.sendgrid_api_key != "" ? [1] : []
    content {
      name  = "sendgrid-api-key"
      value = var.sendgrid_api_key
    }
  }

  tags = var.tags
}

locals {
  database_url = "postgres://${var.postgres_admin_username}:${urlencode(random_password.postgres_admin.result)}@${azurerm_postgresql_flexible_server.auth.fqdn}:5432/${var.postgres_database_name}?sslmode=require"
}

