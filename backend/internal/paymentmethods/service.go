package paymentmethods

import (
"context"
"errors"
"strings"
	"github.com/blanquicet/conti/backend/internal/audit"
)

// Service handles payment method business logic
type Service struct {
	auditService audit.Service
repo Repository
}

// NewService creates a new payment method service
func NewService(repo Repository, auditService audit.Service) *Service {
return &Service{
		repo:         repo,
		auditService: auditService,
	}
}

// CreateInput contains the data needed to create a payment method
type CreateInput struct {
HouseholdID           string
OwnerID               string
Name                  string
Type                  PaymentMethodType
IsSharedWithHousehold bool
IsActive              *bool   // Optional, defaults to true if nil
Last4                 *string
Institution           *string
Notes                 *string
LinkedAccountID       *string
CutoffDay             *int
}

// Validate validates the input
func (i *CreateInput) Validate() error {
i.Name = strings.TrimSpace(i.Name)
if i.Name == "" {
return errors.New("payment method name is required")
}
if len(i.Name) > 100 {
return errors.New("payment method name must be 100 characters or less")
}
if i.HouseholdID == "" {
return errors.New("household ID is required")
}
if i.OwnerID == "" {
return errors.New("owner ID is required")
}
if err := i.Type.Validate(); err != nil {
return err
}
if i.Last4 != nil {
*i.Last4 = strings.TrimSpace(*i.Last4)
if len(*i.Last4) > 0 && len(*i.Last4) != 4 {
return errors.New("last4 must be exactly 4 characters")
}
}
if i.Institution != nil {
*i.Institution = strings.TrimSpace(*i.Institution)
if len(*i.Institution) > 100 {
return errors.New("institution must be 100 characters or less")
}
}
return nil
}

// Create creates a new payment method
func (s *Service) Create(ctx context.Context, input *CreateInput) (*PaymentMethod, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Default is_active to true if not specified
	isActive := true
	if input.IsActive != nil {
		isActive = *input.IsActive
	}

	pm := &PaymentMethod{
		HouseholdID:           input.HouseholdID,
		OwnerID:               input.OwnerID,
		Name:                  input.Name,
		Type:                  input.Type,
		IsSharedWithHousehold: input.IsSharedWithHousehold,
		Last4:                 input.Last4,
		Institution:           input.Institution,
		Notes:                 input.Notes,
		IsActive:              isActive,
		LinkedAccountID:       input.LinkedAccountID,
		CutoffDay:             input.CutoffDay,
	}

	created, err := s.repo.Create(ctx, pm)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionPaymentMethodCreated,
			ResourceType: "payment_method",
			UserID:       audit.StringPtr(input.OwnerID),
			HouseholdID:  audit.StringPtr(input.HouseholdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionPaymentMethodCreated,
		ResourceType: "payment_method",
		ResourceID:   audit.StringPtr(created.ID),
		UserID:       audit.StringPtr(input.OwnerID),
		HouseholdID:  audit.StringPtr(input.HouseholdID),
		Success:      true,
		NewValues:    audit.StructToMap(created),
	})

	return created, nil
}

// UpdateInput contains the data needed to update a payment method
type UpdateInput struct {
	ID                    string
	Name                  *string
	IsSharedWithHousehold *bool
	Last4                 *string
	Institution           *string
	Notes                 *string
	IsActive              *bool
	LinkedAccountID       *string
	CutoffDay             *int
	OwnerID               string // for authorization
}

// Validate validates the input
func (i *UpdateInput) Validate() error {
if i.ID == "" {
return errors.New("payment method ID is required")
}
if i.OwnerID == "" {
return errors.New("owner ID is required for authorization")
}
if i.Name != nil {
*i.Name = strings.TrimSpace(*i.Name)
if *i.Name == "" {
return errors.New("payment method name cannot be empty")
}
if len(*i.Name) > 100 {
return errors.New("payment method name must be 100 characters or less")
}
}
if i.Last4 != nil {
*i.Last4 = strings.TrimSpace(*i.Last4)
if len(*i.Last4) > 0 && len(*i.Last4) != 4 {
return errors.New("last4 must be exactly 4 characters")
}
}
if i.Institution != nil {
*i.Institution = strings.TrimSpace(*i.Institution)
if len(*i.Institution) > 100 {
return errors.New("institution must be 100 characters or less")
}
}
return nil
}

// Update updates a payment method
func (s *Service) Update(ctx context.Context, input *UpdateInput) (*PaymentMethod, error) {
if err := input.Validate(); err != nil {
return nil, err
}

// Get existing payment method
existing, err := s.repo.GetByID(ctx, input.ID)
if err != nil {
return nil, err
}

// Check ownership
if existing.OwnerID != input.OwnerID {
return nil, ErrNotAuthorized
}

// Store old values for audit
oldValues := audit.StructToMap(existing)

// Apply updates
if input.Name != nil {
existing.Name = *input.Name
}
if input.IsSharedWithHousehold != nil {
existing.IsSharedWithHousehold = *input.IsSharedWithHousehold
}
if input.Last4 != nil {
existing.Last4 = input.Last4
}
if input.Institution != nil {
	existing.Institution = input.Institution
	}
	if input.Notes != nil {
		existing.Notes = input.Notes
	}
	if input.IsActive != nil {
		existing.IsActive = *input.IsActive
	}
	if input.LinkedAccountID != nil {
		existing.LinkedAccountID = input.LinkedAccountID
	}
	if input.CutoffDay != nil {
		existing.CutoffDay = input.CutoffDay
	}

	updated, err := s.repo.Update(ctx, existing)
if err != nil {
s.auditService.LogAsync(ctx, &audit.LogInput{
Action:       audit.ActionPaymentMethodUpdated,
ResourceType: "payment_method",
ResourceID:   audit.StringPtr(input.ID),
UserID:       audit.StringPtr(input.OwnerID),
HouseholdID:  audit.StringPtr(existing.HouseholdID),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
return nil, err
}

s.auditService.LogAsync(ctx, &audit.LogInput{
Action:       audit.ActionPaymentMethodUpdated,
ResourceType: "payment_method",
ResourceID:   audit.StringPtr(input.ID),
UserID:       audit.StringPtr(input.OwnerID),
HouseholdID:  audit.StringPtr(existing.HouseholdID),
Success:      true,
OldValues:    oldValues,
NewValues:    audit.StructToMap(updated),
})

return updated, nil
}

// Delete deletes a payment method
func (s *Service) Delete(ctx context.Context, id, ownerID string) error {
// Get existing payment method
existing, err := s.repo.GetByID(ctx, id)
if err != nil {
return err
}

// Check ownership
if existing.OwnerID != ownerID {
return ErrNotAuthorized
}

err = s.repo.Delete(ctx, id)
if err != nil {
s.auditService.LogAsync(ctx, &audit.LogInput{
Action:       audit.ActionPaymentMethodDeleted,
ResourceType: "payment_method",
ResourceID:   audit.StringPtr(id),
UserID:       audit.StringPtr(ownerID),
HouseholdID:  audit.StringPtr(existing.HouseholdID),
Success:      false,
ErrorMessage: audit.StringPtr(err.Error()),
})
return err
}

s.auditService.LogAsync(ctx, &audit.LogInput{
Action:       audit.ActionPaymentMethodDeleted,
ResourceType: "payment_method",
ResourceID:   audit.StringPtr(id),
UserID:       audit.StringPtr(ownerID),
HouseholdID:  audit.StringPtr(existing.HouseholdID),
Success:      true,
OldValues:    audit.StructToMap(existing),
})

return nil
}

// ListByHousehold lists all payment methods for a household that the user can see
// (own methods + shared methods)
func (s *Service) ListByHousehold(ctx context.Context, householdID, userID string) ([]*PaymentMethod, error) {
all, err := s.repo.ListByHousehold(ctx, householdID)
if err != nil {
return nil, err
}

// Filter: only return methods owned by user OR shared with household
var filtered []*PaymentMethod
for _, pm := range all {
if pm.OwnerID == userID || pm.IsSharedWithHousehold {
filtered = append(filtered, pm)
}
}

return filtered, nil
}

// ListByOwner lists only payment methods owned by the user (not shared ones from others)
func (s *Service) ListByOwner(ctx context.Context, householdID, userID string) ([]*PaymentMethod, error) {
all, err := s.repo.ListByHousehold(ctx, householdID)
if err != nil {
return nil, err
}

// Filter: only return methods owned by user
var filtered []*PaymentMethod
for _, pm := range all {
if pm.OwnerID == userID {
filtered = append(filtered, pm)
}
}

return filtered, nil
}

// GetByID retrieves a payment method if the user has access to it
func (s *Service) GetByID(ctx context.Context, id, userID string) (*PaymentMethod, error) {
pm, err := s.repo.GetByID(ctx, id)
if err != nil {
return nil, err
}

// Check access: must be owner or household member where it's shared
if pm.OwnerID != userID && !pm.IsSharedWithHousehold {
return nil, ErrNotAuthorized
}

return pm, nil
}

// ListSharedPaymentMethods returns only payment methods shared with the household (active only)
func (s *Service) ListSharedPaymentMethods(ctx context.Context, householdID, userID string) ([]*PaymentMethod, error) {
all, err := s.repo.ListByHousehold(ctx, householdID)
if err != nil {
return nil, err
}

// Filter: only return methods that are shared AND active
var filtered []*PaymentMethod
for _, pm := range all {
if pm.IsSharedWithHousehold && pm.IsActive {
filtered = append(filtered, pm)
}
}

return filtered, nil
}
