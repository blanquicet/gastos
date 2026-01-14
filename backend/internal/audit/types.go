package audit

import (
"context"
"net/http"
"time"
)

// Action represents an auditable action
type Action string

// Action constants (matching DB enum)
const (
// Authentication
ActionAuthLogin                Action = "AUTH_LOGIN"
ActionAuthLogout               Action = "AUTH_LOGOUT"
ActionAuthPasswordResetRequest Action = "AUTH_PASSWORD_RESET_REQUEST"
ActionAuthPasswordResetComplete Action = "AUTH_PASSWORD_RESET_COMPLETE"
ActionAuthSessionExpired       Action = "AUTH_SESSION_EXPIRED"

// User management
ActionUserCreated Action = "USER_CREATED"
ActionUserUpdated Action = "USER_UPDATED"
ActionUserDeleted Action = "USER_DELETED"

// Household management
ActionHouseholdCreated           Action = "HOUSEHOLD_CREATED"
ActionHouseholdUpdated           Action = "HOUSEHOLD_UPDATED"
ActionHouseholdDeleted           Action = "HOUSEHOLD_DELETED"
ActionHouseholdMemberAdded       Action = "HOUSEHOLD_MEMBER_ADDED"
ActionHouseholdMemberRemoved     Action = "HOUSEHOLD_MEMBER_REMOVED"
ActionHouseholdInvitationSent    Action = "HOUSEHOLD_INVITATION_SENT"
ActionHouseholdInvitationAccepted Action = "HOUSEHOLD_INVITATION_ACCEPTED"
ActionHouseholdInvitationDeclined Action = "HOUSEHOLD_INVITATION_DECLINED"

// Contacts
ActionContactCreated     Action = "CONTACT_CREATED"
ActionContactUpdated     Action = "CONTACT_UPDATED"
ActionContactDeleted     Action = "CONTACT_DELETED"
ActionContactActivated   Action = "CONTACT_ACTIVATED"
ActionContactDeactivated Action = "CONTACT_DEACTIVATED"

// Accounts
ActionAccountCreated Action = "ACCOUNT_CREATED"
ActionAccountUpdated Action = "ACCOUNT_UPDATED"
ActionAccountDeleted Action = "ACCOUNT_DELETED"

// Payment Methods
ActionPaymentMethodCreated Action = "PAYMENT_METHOD_CREATED"
ActionPaymentMethodUpdated Action = "PAYMENT_METHOD_UPDATED"
ActionPaymentMethodDeleted Action = "PAYMENT_METHOD_DELETED"

// Income
ActionIncomeCreated Action = "INCOME_CREATED"
ActionIncomeUpdated Action = "INCOME_UPDATED"
ActionIncomeDeleted Action = "INCOME_DELETED"

// Movements
ActionMovementCreated Action = "MOVEMENT_CREATED"
ActionMovementUpdated Action = "MOVEMENT_UPDATED"
ActionMovementDeleted Action = "MOVEMENT_DELETED"

// Categories
ActionCategoryCreated      Action = "CATEGORY_CREATED"
ActionCategoryUpdated      Action = "CATEGORY_UPDATED"
ActionCategoryDeleted      Action = "CATEGORY_DELETED"
ActionCategoryGroupCreated Action = "CATEGORY_GROUP_CREATED"
ActionCategoryGroupUpdated Action = "CATEGORY_GROUP_UPDATED"
ActionCategoryGroupDeleted Action = "CATEGORY_GROUP_DELETED"

// Budgets
ActionBudgetCreated Action = "BUDGET_CREATED"
ActionBudgetUpdated Action = "BUDGET_UPDATED"
ActionBudgetDeleted Action = "BUDGET_DELETED"
)

// AuditLog represents a single audit log entry
type AuditLog struct {
ID           string                 `json:"id"`
UserID       *string                `json:"user_id,omitempty"`
CreatedAt    time.Time              `json:"created_at"`
Action       Action                 `json:"action"`
ResourceType string                 `json:"resource_type"`
ResourceID   *string                `json:"resource_id,omitempty"`
HouseholdID  *string                `json:"household_id,omitempty"`
IPAddress    *string                `json:"ip_address,omitempty"`
UserAgent    *string                `json:"user_agent,omitempty"`
OldValues    map[string]interface{} `json:"old_values,omitempty"`
NewValues    map[string]interface{} `json:"new_values,omitempty"`
Metadata     map[string]interface{} `json:"metadata,omitempty"`
Success      bool                   `json:"success"`
ErrorMessage *string                `json:"error_message,omitempty"`
}

// LogInput represents input for creating an audit log
type LogInput struct {
UserID       *string                `json:"user_id,omitempty"`
Action       Action                 `json:"action"`
ResourceType string                 `json:"resource_type"`
ResourceID   *string                `json:"resource_id,omitempty"`
HouseholdID  *string                `json:"household_id,omitempty"`
IPAddress    *string                `json:"ip_address,omitempty"`
UserAgent    *string                `json:"user_agent,omitempty"`
OldValues    map[string]interface{} `json:"old_values,omitempty"`
NewValues    map[string]interface{} `json:"new_values,omitempty"`
Metadata     map[string]interface{} `json:"metadata,omitempty"`
Success      bool                   `json:"success"`
ErrorMessage *string                `json:"error_message,omitempty"`
}

// ListFilters represents filters for querying audit logs
type ListFilters struct {
UserID       *string
HouseholdID  *string
Action       *Action
ResourceType *string
ResourceID   *string
StartTime    *time.Time
EndTime      *time.Time
SuccessOnly  *bool
Limit        int
Offset       int
}

// Repository interface for audit log data access
type Repository interface {
Create(ctx context.Context, input *LogInput) (*AuditLog, error)
GetByID(ctx context.Context, id string) (*AuditLog, error)
List(ctx context.Context, filters *ListFilters) ([]*AuditLog, int, error)
DeleteOlderThan(ctx context.Context, before time.Time) (int64, error)
}

// Service interface for audit logging
type Service interface {
Log(ctx context.Context, input *LogInput) error
LogAsync(ctx context.Context, input *LogInput)
LogFromRequest(r *http.Request, input *LogInput) error
Query(ctx context.Context, filters *ListFilters) ([]*AuditLog, int, error)
Cleanup(ctx context.Context, retentionDays int) (int64, error)
}
