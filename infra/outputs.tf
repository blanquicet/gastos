# =============================================================================
# Outputs
# =============================================================================

output "postgres_server_fqdn" {
  description = "Fully qualified domain name of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.auth.fqdn
}

output "postgres_server_name" {
  description = "Name of the PostgreSQL server"
  value       = azurerm_postgresql_flexible_server.auth.name
}

output "postgres_database_name" {
  description = "Name of the authentication database"
  value       = azurerm_postgresql_flexible_server_database.auth.name
}

output "postgres_admin_username" {
  description = "Administrator username"
  value       = azurerm_postgresql_flexible_server.auth.administrator_login
}

output "postgres_admin_password" {
  description = "Administrator password (sensitive)"
  value       = random_password.postgres_admin.result
  sensitive   = true
}

# Connection string for the Go backend (DATABASE_URL format)
output "database_url" {
  description = "PostgreSQL connection string for the backend (sensitive)"
  value       = "postgres://${azurerm_postgresql_flexible_server.auth.administrator_login}:${urlencode(random_password.postgres_admin.result)}@${azurerm_postgresql_flexible_server.auth.fqdn}:5432/${azurerm_postgresql_flexible_server_database.auth.name}?sslmode=require"
  sensitive   = true
}

# Instructions output
output "next_steps" {
  description = "Instructions after applying"
  value       = <<-EOT

    ✅ Infrastructure created successfully!

    PostgreSQL:
      terraform output -raw database_url
      psql "$(terraform output -raw database_url)"

    Container Apps API:
      URL: ${azurerm_container_app.api.ingress[0].fqdn}

    Run migrations:
      export DATABASE_URL="$(terraform output -raw database_url)"
      cd ../backend
      migrate -path migrations -database "$DATABASE_URL" up

  EOT
}

# =============================================================================
# Container Apps Outputs
# =============================================================================

output "container_app_url" {
  description = "URL of the Container App API"
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}

output "container_app_name" {
  description = "Name of the Container App"
  value       = azurerm_container_app.api.name
}

output "container_app_environment_name" {
  description = "Name of the Container App Environment"
  value       = azurerm_container_app_environment.api.name
}

# =============================================================================
# Azure OpenAI Outputs
# =============================================================================

output "openai_endpoint" {
  description = "Azure OpenAI endpoint URL"
  value       = azurerm_cognitive_account.openai.endpoint
}

output "openai_resource_id" {
  description = "Azure OpenAI resource ID"
  value       = azurerm_cognitive_account.openai.id
}

output "openai_chat_deployment_name" {
  description = "Chat model deployment name"
  value       = azurerm_cognitive_deployment.chat.name
}

output "container_app_identity_principal_id" {
  description = "Principal ID of the Container App's managed identity"
  value       = azurerm_user_assigned_identity.api.principal_id
}

output "openai_embeddings_deployment_name" {
  description = "Embeddings model deployment name (empty if disabled)"
  value       = var.openai_embeddings_enabled ? azurerm_cognitive_deployment.embeddings[0].name : ""
}
