-- Create audit_action enum with all auditable actions
CREATE TYPE audit_action AS ENUM (
  -- Authentication
  'AUTH_LOGIN',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_RESET_REQUEST',
  'AUTH_PASSWORD_RESET_COMPLETE',
  'AUTH_SESSION_EXPIRED',
  
  -- User management
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  
  -- Household management
  'HOUSEHOLD_CREATED',
  'HOUSEHOLD_UPDATED',
  'HOUSEHOLD_DELETED',
  'HOUSEHOLD_MEMBER_ADDED',
  'HOUSEHOLD_MEMBER_REMOVED',
  'HOUSEHOLD_INVITATION_SENT',
  'HOUSEHOLD_INVITATION_ACCEPTED',
  'HOUSEHOLD_INVITATION_DECLINED',
  
  -- Contacts
  'CONTACT_CREATED',
  'CONTACT_UPDATED',
  'CONTACT_DELETED',
  'CONTACT_ACTIVATED',
  'CONTACT_DEACTIVATED',
  
  -- Accounts
  'ACCOUNT_CREATED',
  'ACCOUNT_UPDATED',
  'ACCOUNT_DELETED',
  
  -- Payment Methods
  'PAYMENT_METHOD_CREATED',
  'PAYMENT_METHOD_UPDATED',
  'PAYMENT_METHOD_DELETED',
  
  -- Income
  'INCOME_CREATED',
  'INCOME_UPDATED',
  'INCOME_DELETED',
  
  -- Movements
  'MOVEMENT_CREATED',
  'MOVEMENT_UPDATED',
  'MOVEMENT_DELETED',
  
  -- Categories
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'CATEGORY_GROUP_CREATED',
  'CATEGORY_GROUP_UPDATED',
  'CATEGORY_GROUP_DELETED',
  
  -- Budgets
  'BUDGET_CREATED',
  'BUDGET_UPDATED',
  'BUDGET_DELETED'
);

-- Create audit_logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Who (NULL for system actions or deleted users)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- When
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- What
  action audit_action NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  
  -- Context (NULL for non-household actions like login)
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  
  -- Where (client info)
  ip_address INET,
  user_agent TEXT,
  
  -- Changes (full snapshots for debugging)
  old_values JSONB,
  new_values JSONB,
  
  -- Additional metadata
  metadata JSONB,
  
  -- Status
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT
);

-- Indexes for efficient queries
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_household ON audit_logs(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_household_action ON audit_logs(household_id, action) WHERE household_id IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_household_time ON audit_logs(household_id, created_at DESC) WHERE household_id IS NOT NULL;
