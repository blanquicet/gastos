package households

import (
	"context"
	"errors"
	"time"
)

// Errors for household operations
var (
	ErrHouseholdNotFound      = errors.New("household not found")
	ErrMemberNotFound         = errors.New("member not found")
	ErrContactNotFound        = errors.New("contact not found")
	ErrInvitationNotFound     = errors.New("invitation not found")
	ErrUserAlreadyMember      = errors.New("user is already a member")
	ErrCannotRemoveLastOwner  = errors.New("cannot remove last owner")
	ErrNotAuthorized          = errors.New("not authorized")
	ErrContactNotLinked       = errors.New("contact is not linked to a user account")
	ErrInvalidRole            = errors.New("invalid role")
)

// HouseholdRole represents the role of a user in a household
type HouseholdRole string

const (
	RoleOwner  HouseholdRole = "owner"
	RoleMember HouseholdRole = "member"
)

// Validate checks if the role is valid
func (r HouseholdRole) Validate() error {
	switch r {
	case RoleOwner, RoleMember:
		return nil
	default:
		return ErrInvalidRole
	}
}

// Household represents a group of people who share finances
type Household struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Currency  string    `json:"currency"`
	Timezone  string    `json:"timezone"`
}

// Validate validates household fields
func (h *Household) Validate() error {
	if h.Name == "" {
		return errors.New("household name is required")
	}
	if len(h.Name) > 100 {
		return errors.New("household name must be 100 characters or less")
	}
	return nil
}

// HouseholdMember represents a user's membership in a household
type HouseholdMember struct {
	ID          string        `json:"id"`
	HouseholdID string        `json:"household_id"`
	UserID      string        `json:"user_id"`
	Role        HouseholdRole `json:"role"`
	JoinedAt    time.Time     `json:"joined_at"`
	
	// Populated from joins - not in DB table
	UserEmail string `json:"user_email,omitempty"`
	UserName  string `json:"user_name,omitempty"`
}

// Contact represents an external person with whom the household has transactions
type Contact struct {
	ID           string     `json:"id"`
	HouseholdID  string     `json:"household_id"`
	Name         string     `json:"name"`
	Email        *string    `json:"email,omitempty"`
	Phone        *string    `json:"phone,omitempty"`
	LinkedUserID *string    `json:"linked_user_id,omitempty"`
	Notes        *string    `json:"notes,omitempty"`
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	
	// Computed field - not in DB
	IsRegistered bool `json:"is_registered"`
}

// Validate validates contact fields
func (c *Contact) Validate() error {
	if c.Name == "" {
		return errors.New("contact name is required")
	}
	if len(c.Name) > 100 {
		return errors.New("contact name must be 100 characters or less")
	}
	if c.Email != nil && len(*c.Email) > 255 {
		return errors.New("contact email must be 255 characters or less")
	}
	if c.Phone != nil && len(*c.Phone) > 20 {
		return errors.New("contact phone must be 20 characters or less")
	}
	return nil
}

// HouseholdInvitation represents an invitation to join a household
type HouseholdInvitation struct {
	ID          string     `json:"id"`
	HouseholdID string     `json:"household_id"`
	Email       string     `json:"email"`
	Token       string     `json:"-"` // Never expose token in JSON
	InvitedBy   string     `json:"invited_by"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	AcceptedAt  *time.Time `json:"accepted_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	
	// Populated from joins - not in DB table
	HouseholdName string `json:"household_name,omitempty"`
	InviterName   string `json:"inviter_name,omitempty"`
}

// IsExpired checks if the invitation has expired
func (i *HouseholdInvitation) IsExpired() bool {
	if i.ExpiresAt == nil {
		return false // No expiration set (Phase 2)
	}
	return time.Now().After(*i.ExpiresAt)
}

// IsAccepted checks if the invitation has been accepted
func (i *HouseholdInvitation) IsAccepted() bool {
	return i.AcceptedAt != nil
}

// HouseholdRepository defines the interface for household persistence
type HouseholdRepository interface {
	// Household CRUD
	Create(ctx context.Context, name, createdBy string) (*Household, error)
	GetByID(ctx context.Context, id string) (*Household, error)
	Update(ctx context.Context, id, name string) (*Household, error)
	Delete(ctx context.Context, id string) error
	ListByUser(ctx context.Context, userID string) ([]*Household, error)
	
	// Member management
	AddMember(ctx context.Context, householdID, userID string, role HouseholdRole) (*HouseholdMember, error)
	RemoveMember(ctx context.Context, householdID, userID string) error
	UpdateMemberRole(ctx context.Context, householdID, userID string, role HouseholdRole) (*HouseholdMember, error)
	GetMembers(ctx context.Context, householdID string) ([]*HouseholdMember, error)
	GetMemberByUserID(ctx context.Context, householdID, userID string) (*HouseholdMember, error)
	CountOwners(ctx context.Context, householdID string) (int, error)
	
	// Contact management
	CreateContact(ctx context.Context, contact *Contact) (*Contact, error)
	GetContact(ctx context.Context, id string) (*Contact, error)
	UpdateContact(ctx context.Context, contact *Contact, isActive *bool) (*Contact, error)
	DeleteContact(ctx context.Context, id string) error
	ListContacts(ctx context.Context, householdID string) ([]*Contact, error)
	FindContactByEmail(ctx context.Context, householdID, email string) (*Contact, error)
	
	// Invitation management
	CreateInvitation(ctx context.Context, householdID, email, token, invitedBy string) (*HouseholdInvitation, error)
	GetInvitationByToken(ctx context.Context, token string) (*HouseholdInvitation, error)
	AcceptInvitation(ctx context.Context, id string) error
	ListPendingInvitations(ctx context.Context, householdID string) ([]*HouseholdInvitation, error)
	
	// Helper methods
	GetUserHouseholdID(ctx context.Context, userID string) (string, error)
	IsUserMember(ctx context.Context, householdID, userID string) (bool, error)
}
