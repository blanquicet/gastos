package households

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/blanquicet/conti/backend/internal/audit"
	"github.com/blanquicet/conti/backend/internal/auth"
	"github.com/blanquicet/conti/backend/internal/email"
)

// DefaultCategoriesCreator creates default categories for a new household
type DefaultCategoriesCreator interface {
	CreateDefaultCategories(ctx context.Context, householdID string) error
}

// Service handles household business logic
type Service struct {
	repo           HouseholdRepository
	userRepo       auth.UserRepository
	categoriesRepo DefaultCategoriesCreator
	auditService   audit.Service
	emailSender    email.Sender
}

// NewService creates a new household service
func NewService(repo HouseholdRepository, userRepo auth.UserRepository, categoriesRepo DefaultCategoriesCreator, auditService audit.Service, emailSender email.Sender) *Service {
	return &Service{
		repo:           repo,
		userRepo:       userRepo,
		categoriesRepo: categoriesRepo,
		auditService:   auditService,
		emailSender:    emailSender,
	}
}

// CreateHouseholdInput contains the data needed to create a household
type CreateHouseholdInput struct {
	Name   string
	UserID string
}

// Validate validates the input
func (i *CreateHouseholdInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("household name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("household name must be 100 characters or less")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// CreateHousehold creates a new household with the user as owner
func (s *Service) CreateHousehold(ctx context.Context, input *CreateHouseholdInput) (*Household, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Verify user exists
	_, err := s.userRepo.GetByID(ctx, input.UserID)
	if err != nil {
		if errors.Is(err, auth.ErrUserNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}

	// Create household (repository handles adding creator as owner)
	household, err := s.repo.Create(ctx, input.Name, input.UserID)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionHouseholdCreated,
			ResourceType: "household",
			UserID:       audit.StringPtr(input.UserID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionHouseholdCreated,
		ResourceType: "household",
		ResourceID:   audit.StringPtr(household.ID),
		UserID:       audit.StringPtr(input.UserID),
		HouseholdID:  audit.StringPtr(household.ID),
		Success:      true,
		NewValues:    audit.StructToMap(household),
	})

	// Create default categories for the new household
	if err := s.categoriesRepo.CreateDefaultCategories(ctx, household.ID); err != nil {
		// Log but don't fail — household is created, categories can be added manually
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       "DEFAULT_CATEGORIES_FAILED",
			ResourceType: "category",
			HouseholdID:  audit.StringPtr(household.ID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
	}

	return household, nil
}

// GetHousehold retrieves a household if the user is a member
func (s *Service) GetHousehold(ctx context.Context, householdID, userID string) (*Household, error) {
	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, householdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	return s.repo.GetByID(ctx, householdID)
}

// UpdateHouseholdInput contains the data needed to update a household
type UpdateHouseholdInput struct {
	HouseholdID string
	Name        string
	UserID      string
}

// Validate validates the input
func (i *UpdateHouseholdInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("household name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("household name must be 100 characters or less")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// UpdateHousehold updates a household name (requires membership)
func (s *Service) UpdateHousehold(ctx context.Context, input *UpdateHouseholdInput) (*Household, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	// Get old values for audit
	oldHousehold, err := s.repo.GetByID(ctx, input.HouseholdID)
	if err != nil {
		return nil, err
	}
	oldValues := audit.StructToMap(oldHousehold)

	updated, err := s.repo.Update(ctx, input.HouseholdID, input.Name)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionHouseholdUpdated,
			ResourceType: "household",
			ResourceID:   audit.StringPtr(input.HouseholdID),
			UserID:       audit.StringPtr(input.UserID),
			HouseholdID:  audit.StringPtr(input.HouseholdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionHouseholdUpdated,
		ResourceType: "household",
		ResourceID:   audit.StringPtr(input.HouseholdID),
		UserID:       audit.StringPtr(input.UserID),
		HouseholdID:  audit.StringPtr(input.HouseholdID),
		Success:      true,
		OldValues:    oldValues,
		NewValues:    audit.StructToMap(updated),
	})

	return updated, nil
}

// DeleteHousehold deletes a household (owner only)
func (s *Service) DeleteHousehold(ctx context.Context, householdID, userID string) error {
	// Check user is an owner
	member, err := s.repo.GetMemberByUserID(ctx, householdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return ErrNotAuthorized
		}
		return err
	}
	if member.Role != RoleOwner {
		return ErrNotAuthorized
	}

	// Get household for audit log before deletion
	household, err := s.repo.GetByID(ctx, householdID)
	if err != nil {
		return err
	}

	err = s.repo.Delete(ctx, householdID)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionHouseholdDeleted,
			ResourceType: "household",
			ResourceID:   audit.StringPtr(householdID),
			UserID:       audit.StringPtr(userID),
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionHouseholdDeleted,
		ResourceType: "household",
		ResourceID:   audit.StringPtr(householdID),
		UserID:       audit.StringPtr(userID),
		HouseholdID:  audit.StringPtr(householdID),
		Success:      true,
		OldValues:    audit.StructToMap(household),
	})

	return nil
}

// ListUserHouseholds retrieves all households where the user is a member
func (s *Service) ListUserHouseholds(ctx context.Context, userID string) ([]*Household, error) {
	return s.repo.ListByUser(ctx, userID)
}

// AddMemberInput contains the data needed to add a member
type AddMemberInput struct {
	HouseholdID string
	Email       string
	UserID      string // User making the request
}

// Validate validates the input
func (i *AddMemberInput) Validate() error {
	i.Email = strings.TrimSpace(strings.ToLower(i.Email))
	if i.Email == "" {
		return errors.New("email is required")
	}
	if !strings.Contains(i.Email, "@") {
		return errors.New("invalid email format")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// AddMember adds a user to a household (requires membership, auto-accepts)
func (s *Service) AddMember(ctx context.Context, input *AddMemberInput) (*HouseholdMember, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check requester is a member
	_, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	// Find user by email
	user, err := s.userRepo.GetByEmail(ctx, input.Email)
	if err != nil {
		if errors.Is(err, auth.ErrUserNotFound) {
			return nil, errors.New("user not found with that email")
		}
		return nil, err
	}

	// Add as member
	member, err := s.repo.AddMember(ctx, input.HouseholdID, user.ID, RoleMember)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionHouseholdMemberAdded,
			ResourceType: "household_member",
			UserID:       audit.StringPtr(input.UserID),
			HouseholdID:  audit.StringPtr(input.HouseholdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
			Metadata: map[string]interface{}{
				"target_user_email": input.Email,
				"target_user_id":    user.ID,
			},
		})
		return nil, err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionHouseholdMemberAdded,
		ResourceType: "household_member",
		ResourceID:   audit.StringPtr(member.ID),
		UserID:       audit.StringPtr(input.UserID),
		HouseholdID:  audit.StringPtr(input.HouseholdID),
		Success:      true,
		NewValues:    audit.StructToMap(member),
	})

	return member, nil
}

// RemoveMemberInput contains the data needed to remove a member
type RemoveMemberInput struct {
	HouseholdID string
	MemberID    string
	UserID      string // User making the request
}

// RemoveMember removes a user from a household
func (s *Service) RemoveMember(ctx context.Context, input *RemoveMemberInput) error {
	if input.HouseholdID == "" || input.MemberID == "" || input.UserID == "" {
		return errors.New("household ID, member ID, and user ID are required")
	}

	// Get requester's membership
	requester, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return ErrNotAuthorized
		}
		return err
	}

	// Get member to be removed
	member, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.MemberID)
	if err != nil {
		return err
	}

	// Check authorization:
	// - Owners can remove anyone
	// - Members can only remove themselves
	if requester.Role != RoleOwner && input.MemberID != input.UserID {
		return ErrNotAuthorized
	}

	// If removing an owner, check it's not the last one
	if member.Role == RoleOwner {
		count, err := s.repo.CountOwners(ctx, input.HouseholdID)
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrCannotRemoveLastOwner
		}
	}

	// Store old values for audit
	oldValues := audit.StructToMap(member)

	err = s.repo.RemoveMember(ctx, input.HouseholdID, input.MemberID)
	if err != nil {
		s.auditService.LogAsync(ctx, &audit.LogInput{
			Action:       audit.ActionHouseholdMemberRemoved,
			ResourceType: "household_member",
			ResourceID:   audit.StringPtr(member.ID),
			UserID:       audit.StringPtr(input.UserID),
			HouseholdID:  audit.StringPtr(input.HouseholdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	s.auditService.LogAsync(ctx, &audit.LogInput{
		Action:       audit.ActionHouseholdMemberRemoved,
		ResourceType: "household_member",
		ResourceID:   audit.StringPtr(member.ID),
		UserID:       audit.StringPtr(input.UserID),
		HouseholdID:  audit.StringPtr(input.HouseholdID),
		Success:      true,
		OldValues:    oldValues,
	})

	return nil
}

// UpdateMemberRoleInput contains the data needed to update a member's role
type UpdateMemberRoleInput struct {
	HouseholdID string
	MemberID    string
	Role        HouseholdRole
	UserID      string // User making the request
}

// UpdateMemberRole updates a member's role (owner only)
func (s *Service) UpdateMemberRole(ctx context.Context, input *UpdateMemberRoleInput) (*HouseholdMember, error) {
	if input.HouseholdID == "" || input.MemberID == "" || input.UserID == "" {
		return nil, errors.New("household ID, member ID, and user ID are required")
	}
	if err := input.Role.Validate(); err != nil {
		return nil, err
	}

	// Check requester is an owner
	requester, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}
	if requester.Role != RoleOwner {
		return nil, ErrNotAuthorized
	}

	// Get current member info
	member, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.MemberID)
	if err != nil {
		return nil, err
	}

	// If demoting yourself to member, ensure you're not the last owner
	if input.MemberID == input.UserID && member.Role == RoleOwner && input.Role == RoleMember {
		count, err := s.repo.CountOwners(ctx, input.HouseholdID)
		if err != nil {
			return nil, err
		}
		if count <= 1 {
			return nil, errors.New("cannot demote yourself as the last owner")
		}
	}

	return s.repo.UpdateMemberRole(ctx, input.HouseholdID, input.MemberID, input.Role)
}

// GetMembers retrieves all members of a household
func (s *Service) GetMembers(ctx context.Context, householdID, userID string) ([]*HouseholdMember, error) {
	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, householdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	return s.repo.GetMembers(ctx, householdID)
}

// CreateContactInput contains the data needed to create a contact
type CreateContactInput struct {
	HouseholdID string
	Name        string
	Email       *string
	Phone       *string
	Notes       *string
	UserID      string // User making the request
	RequestLink bool   // If true, send a link request when email matches a registered user
}

// Validate validates the input
func (i *CreateContactInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("contact name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("contact name must be 100 characters or less")
	}
	if i.Email != nil {
		email := strings.TrimSpace(strings.ToLower(*i.Email))
		i.Email = &email
		if len(*i.Email) > 255 {
			return errors.New("contact email must be 255 characters or less")
		}
	}
	if i.Phone != nil {
		phone := strings.TrimSpace(*i.Phone)
		i.Phone = &phone
		if len(*i.Phone) > 20 {
			return errors.New("contact phone must be 20 characters or less")
		}
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// ListContacts lists all contacts for a household
func (s *Service) ListContacts(ctx context.Context, householdID string, userID string) ([]*Contact, error) {
	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, householdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	return s.repo.ListContacts(ctx, householdID)
}

// CreateContact creates a new contact with auto-linking if email matches a user
func (s *Service) CreateContact(ctx context.Context, input *CreateContactInput) (*Contact, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	contact := &Contact{
		HouseholdID: input.HouseholdID,
		Name:        input.Name,
		Email:       input.Email,
		Phone:       input.Phone,
		Notes:       input.Notes,
		IsActive:    true, // New contacts are active by default
		LinkStatus:  "NONE",
	}

	// Only link if explicitly requested
	if input.RequestLink && input.Email != nil && *input.Email != "" {
		user, err := s.userRepo.GetByEmail(ctx, *input.Email)
		if err == nil {
			contact.LinkedUserID = &user.ID
			contact.LinkStatus = "PENDING"
			contact.LinkRequestedByUserID = &input.UserID // Track who sent the request
			now := time.Now()
			contact.LinkRequestedAt = &now
		}
	}

	created, err := s.repo.CreateContact(ctx, contact)
	if err != nil {
		return nil, err
	}

	// Send link request email if linked
	if created.LinkStatus == "PENDING" && created.Email != nil {
		household, hErr := s.repo.GetByID(ctx, input.HouseholdID)
		if hErr == nil {
			requester, rErr := s.userRepo.GetByID(ctx, input.UserID)
			if rErr == nil {
				_ = s.emailSender.SendLinkRequest(ctx, *created.Email, requester.Name, household.Name, "")
			}
		}
	}

	return created, nil
}

// UpdateContactInput contains the data needed to update a contact
type UpdateContactInput struct {
	ContactID   string
	HouseholdID string
	Name        string
	Email       *string
	Phone       *string
	Notes       *string
	IsActive    *bool
	UserID      string // User making the request
}

// Validate validates the input
func (i *UpdateContactInput) Validate() error {
	i.Name = strings.TrimSpace(i.Name)
	if i.Name == "" {
		return errors.New("contact name is required")
	}
	if len(i.Name) > 100 {
		return errors.New("contact name must be 100 characters or less")
	}
	if i.Email != nil {
		email := strings.TrimSpace(strings.ToLower(*i.Email))
		i.Email = &email
		if len(*i.Email) > 255 {
			return errors.New("contact email must be 255 characters or less")
		}
	}
	if i.Phone != nil {
		phone := strings.TrimSpace(*i.Phone)
		i.Phone = &phone
		if len(*i.Phone) > 20 {
			return errors.New("contact phone must be 20 characters or less")
		}
	}
	if i.ContactID == "" {
		return errors.New("contact ID is required")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// UpdateContact updates a contact with auto-linking
func (s *Service) UpdateContact(ctx context.Context, input *UpdateContactInput) (*Contact, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}

	// Get existing contact to verify household ownership
	existing, err := s.repo.GetContact(ctx, input.ContactID)
	if err != nil {
		return nil, err
	}
	if existing.HouseholdID != input.HouseholdID {
		return nil, ErrNotAuthorized
	}

	contact := &Contact{
		ID:          input.ContactID,
		HouseholdID: input.HouseholdID,
		Name:        input.Name,
		Email:       input.Email,
		Phone:       input.Phone,
		Notes:       input.Notes,
	}

	// Set IsActive if provided, otherwise keep existing value
	if input.IsActive != nil {
		// We'll need to get the existing value and update it in the repo
		// For now, we'll handle this in the repository layer
	}

	return s.repo.UpdateContact(ctx, contact, input.IsActive)
}

// DeleteContact deletes a contact (member or owner)
func (s *Service) DeleteContact(ctx context.Context, contactID, householdID, userID string) error {
	// Check user is a member
	_, err := s.repo.GetMemberByUserID(ctx, householdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return ErrNotAuthorized
		}
		return err
	}

	// Verify contact belongs to household
	contact, err := s.repo.GetContact(ctx, contactID)
	if err != nil {
		return err
	}
	if contact.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	return s.repo.DeleteContact(ctx, contactID)
}

// CheckEmailResult contains the result of checking an email
type CheckEmailResult struct {
	IsRegistered bool   `json:"is_registered"`
	DisplayName  string `json:"display_name,omitempty"`
}

// CheckEmail checks if an email belongs to a registered user
func (s *Service) CheckEmail(ctx context.Context, email string) (*CheckEmailResult, error) {
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return &CheckEmailResult{IsRegistered: false}, nil
	}
	return &CheckEmailResult{
		IsRegistered: true,
		DisplayName:  user.Name,
	}, nil
}

// RequestLink sends a link request for an existing contact
func (s *Service) RequestLink(ctx context.Context, userID, contactID string) error {
	// Get the contact
	contact, err := s.repo.GetContact(ctx, contactID)
	if err != nil {
		return err
	}

	// Check user is a member of the contact's household
	_, err = s.repo.GetMemberByUserID(ctx, contact.HouseholdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return ErrNotAuthorized
		}
		return err
	}

	// Contact must have an email
	if contact.Email == nil || *contact.Email == "" {
		return ErrContactNoEmail
	}

	// Contact must not already be linked or pending
	if contact.LinkStatus == "PENDING" || contact.LinkStatus == "ACCEPTED" {
		return ErrContactAlreadyLinked
	}

	// Check email is registered
	user, err := s.userRepo.GetByEmail(ctx, *contact.Email)
	if err != nil {
		return ErrEmailNotRegistered
	}

	// Set linked_user_id + PENDING via dedicated method
	// userID is the one making the request, user.ID is the linked target
	err = s.repo.UpdateContactLinkedUser(ctx, contact.ID, user.ID, userID, "PENDING")
	if err != nil {
		return err
	}

	// Send link request email
	household, hErr := s.repo.GetByID(ctx, contact.HouseholdID)
	if hErr == nil {
		requester, rErr := s.userRepo.GetByID(ctx, userID)
		if rErr == nil {
			_ = s.emailSender.SendLinkRequest(ctx, *contact.Email, requester.Name, household.Name, "")
		}
	}

	return nil
}

// PromoteContactInput contains the data needed to promote a contact to member
type PromoteContactInput struct {
	ContactID   string
	HouseholdID string
	UserID      string // User making the request
}

// UnlinkContact unlinks a contact bilaterally
func (s *Service) UnlinkContact(ctx context.Context, userID, contactID string) error {
	// Get the contact
	contact, err := s.repo.GetContact(ctx, contactID)
	if err != nil {
		return err
	}

	// Check user is a member of the contact's household
	_, err = s.repo.GetMemberByUserID(ctx, contact.HouseholdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return ErrNotAuthorized
		}
		return err
	}

	// Must be linked (ACCEPTED or PENDING)
	if contact.LinkStatus != "ACCEPTED" && contact.LinkStatus != "PENDING" {
		return ErrContactNotLinked
	}

	// If ACCEPTED, find and unlink the reciprocal contact
	if contact.LinkStatus == "ACCEPTED" && contact.LinkedUserID != nil {
		// Find the linked user's household
		linkedHouseholdID, hErr := s.repo.GetUserHouseholdID(ctx, *contact.LinkedUserID)
		if hErr == nil {
			// Find reciprocal contact (in linked user's household, linked to requesting user's user)
			// The requesting user is a member of contact.HouseholdID, find which user
			members, mErr := s.repo.GetMembers(ctx, contact.HouseholdID)
			if mErr == nil {
				for _, m := range members {
					reciprocal, rErr := s.repo.FindContactByLinkedUserID(ctx, linkedHouseholdID, m.UserID)
					if rErr == nil && reciprocal != nil {
						// Set was_unlinked_at on reciprocal so other user sees banner
						_ = s.repo.SetWasUnlinkedAt(ctx, reciprocal.ID)
						// Unlink reciprocal
						_ = s.repo.UnlinkContact(ctx, reciprocal.ID)
						break
					}
				}
			}
		}
	}

	// Unlink local contact
	return s.repo.UnlinkContact(ctx, contactID)
}

// DismissUnlinkBanner clears the was_unlinked_at notification
func (s *Service) DismissUnlinkBanner(ctx context.Context, userID, contactID string) error {
	contact, err := s.repo.GetContact(ctx, contactID)
	if err != nil {
		return err
	}

	// Check user is a member of the contact's household
	_, err = s.repo.GetMemberByUserID(ctx, contact.HouseholdID, userID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return ErrNotAuthorized
		}
		return err
	}

	return s.repo.DismissUnlinkBanner(ctx, contactID)
}

// PromoteContactToMember promotes a linked contact to household member (owner only)
func (s *Service) PromoteContactToMember(ctx context.Context, input *PromoteContactInput) (*HouseholdMember, error) {
	if input.ContactID == "" || input.HouseholdID == "" || input.UserID == "" {
		return nil, errors.New("contact ID, household ID, and user ID are required")
	}

	// Check requester is an owner
	requester, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}
	if requester.Role != RoleOwner {
		return nil, ErrNotAuthorized
	}

	// Get contact
	contact, err := s.repo.GetContact(ctx, input.ContactID)
	if err != nil {
		return nil, err
	}

	// Verify contact belongs to household
	if contact.HouseholdID != input.HouseholdID {
		return nil, ErrNotAuthorized
	}

	// Check contact is linked to a user
	if contact.LinkedUserID == nil {
		return nil, ErrContactNotLinked
	}

	// Add user as member
	member, err := s.repo.AddMember(ctx, input.HouseholdID, *contact.LinkedUserID, RoleMember)
	if err != nil {
		return nil, err
	}

	// Delete contact (now redundant)
	_ = s.repo.DeleteContact(ctx, input.ContactID)

	return member, nil
}

// GenerateInvitationToken generates a secure random token
func GenerateInvitationToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// CreateInvitationInput contains the data needed to create an invitation
type CreateInvitationInput struct {
	HouseholdID string
	Email       string
	UserID      string // User making the request
}

// Validate validates the input
func (i *CreateInvitationInput) Validate() error {
	i.Email = strings.TrimSpace(strings.ToLower(i.Email))
	if i.Email == "" {
		return errors.New("email is required")
	}
	if !strings.Contains(i.Email, "@") {
		return errors.New("invalid email format")
	}
	if i.HouseholdID == "" {
		return errors.New("household ID is required")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// CreateInvitation creates a household invitation (owner only, Phase 2: auto-accept for existing users)
func (s *Service) CreateInvitation(ctx context.Context, input *CreateInvitationInput) (*HouseholdInvitation, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Check requester is an owner
	requester, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, input.UserID)
	if err != nil {
		if errors.Is(err, ErrMemberNotFound) {
			return nil, ErrNotAuthorized
		}
		return nil, err
	}
	if requester.Role != RoleOwner {
		return nil, ErrNotAuthorized
	}

	// Get household for name (needed for email)
	household, err := s.repo.GetByID(ctx, input.HouseholdID)
	if err != nil {
		return nil, err
	}

	// Get inviter name for email
	inviter, err := s.userRepo.GetByID(ctx, input.UserID)
	if err != nil {
		return nil, err
	}

	// Check if user is already a member of this household
	invitedUser, _ := s.userRepo.GetByEmail(ctx, input.Email)
	if invitedUser != nil {
		// Check if already a member
		_, err := s.repo.GetMemberByUserID(ctx, input.HouseholdID, invitedUser.ID)
		if err == nil {
			// Already a member - return error
			return nil, ErrUserAlreadyMember
		}
	}

	// Always create invitation and send email (whether user exists or not)
	// Generate token
	token, err := GenerateInvitationToken()
	if err != nil {
		return nil, err
	}

	invitation, err := s.repo.CreateInvitation(ctx, input.HouseholdID, input.Email, token, input.UserID)
	if err != nil {
		return nil, err
	}

	// Send invitation email
	if s.emailSender != nil {
		inviterName := inviter.Name
		if inviterName == "" {
			inviterName = inviter.Email
		}
		if err := s.emailSender.SendHouseholdInvitation(ctx, input.Email, token, household.Name, inviterName); err != nil {
			// Log the error but don't fail the invitation creation
			// The token is still valid and can be shared manually
			// TODO: Add proper logging here
			_ = err
		}
	}

	return invitation, nil
}

// AcceptInvitationByTokenInput contains the data needed to accept an invitation by token
type AcceptInvitationByTokenInput struct {
	Token  string
	UserID string // User making the request
}

// Validate validates the input
func (i *AcceptInvitationByTokenInput) Validate() error {
	if i.Token == "" {
		return errors.New("token is required")
	}
	if i.UserID == "" {
		return errors.New("user ID is required")
	}
	return nil
}

// AcceptInvitationByToken accepts a household invitation using a token
// The user's email must match the invitation email
func (s *Service) AcceptInvitationByToken(ctx context.Context, input *AcceptInvitationByTokenInput) (*HouseholdMember, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get the invitation by token
	invitation, err := s.repo.GetInvitationByToken(ctx, input.Token)
	if err != nil {
		if errors.Is(err, ErrInvitationNotFound) {
			return nil, ErrInvitationNotFound
		}
		return nil, err
	}

	// Check if invitation is still valid (not expired, not accepted)
	if invitation.IsAccepted() {
		return nil, errors.New("invitation has already been accepted")
	}
	if invitation.IsExpired() {
		return nil, errors.New("invitation has expired")
	}

	// Get user to verify email matches
	user, err := s.userRepo.GetByID(ctx, input.UserID)
	if err != nil {
		return nil, err
	}

	// Verify user email matches invitation email
	if strings.ToLower(user.Email) != strings.ToLower(invitation.Email) {
		return nil, ErrNotAuthorized
	}

	// Add user as member directly (bypass AddMember which requires existing membership)
	member, err := s.repo.AddMember(ctx, invitation.HouseholdID, input.UserID, RoleMember)
	if err != nil {
		return nil, err
	}

	// Mark invitation as accepted
	if err := s.repo.AcceptInvitation(ctx, invitation.ID); err != nil {
		// Log the error but don't fail - user is already added
		_ = err
	}

	// Audit log
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(input.UserID),
		Action:       audit.ActionHouseholdInvitationAccepted,
		ResourceType: "household_invitation",
		ResourceID:   audit.StringPtr(invitation.ID),
		HouseholdID:  audit.StringPtr(invitation.HouseholdID),
		Success:      true,
		NewValues:    audit.StructToMap(member),
	})

	return member, nil
}

// ListLinkRequests returns all pending link requests for a user
func (s *Service) ListLinkRequests(ctx context.Context, userID string) ([]LinkRequest, error) {
	return s.repo.ListPendingLinkRequests(ctx, userID)
}

// CountLinkRequests returns the count of pending link requests for a user
func (s *Service) CountLinkRequests(ctx context.Context, userID string) (int, error) {
	return s.repo.CountPendingLinkRequests(ctx, userID)
}

// AcceptLinkRequest accepts a pending link request and creates a reciprocal contact
func (s *Service) AcceptLinkRequest(ctx context.Context, userID, contactID, contactName string, existingContactID *string) error {
	// 1. Verify the contact exists and is linked to this user
	contact, err := s.repo.GetContact(ctx, contactID)
	if err != nil {
		return err
	}

	if contact.LinkedUserID == nil || *contact.LinkedUserID != userID {
		return ErrNotAuthorized
	}

	if contact.LinkStatus != "PENDING" {
		return ErrLinkRequestNotPending
	}

	// 2. Find the requester's user ID (the owner of the household that created this contact)
	members, err := s.repo.GetMembers(ctx, contact.HouseholdID)
	if err != nil {
		return err
	}
	var requesterUserID string
	for _, m := range members {
		if m.Role == "owner" {
			requesterUserID = m.UserID
			break
		}
	}
	if requesterUserID == "" && len(members) > 0 {
		requesterUserID = members[0].UserID
	}
	if requesterUserID == "" {
		return errors.New("could not find requester user")
	}

	// 3. Get the acceptor's household
	acceptorHouseholdID, err := s.repo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return err
	}

	// 4. Create or update reciprocal contact in acceptor's household
	if existingContactID != nil && *existingContactID != "" {
		// Update existing contact with linked_user_id
		// When accepting, the original requester is the one who initiated
		err = s.repo.UpdateContactLinkedUser(ctx, *existingContactID, requesterUserID, requesterUserID, "ACCEPTED")
		if err != nil {
			return err
		}
	} else {
		// Check if acceptor already has a contact linked to the requester
		existingContacts, err := s.repo.ListContacts(ctx, acceptorHouseholdID)
		if err != nil {
			return err
		}
		var alreadyLinked bool
		for _, c := range existingContacts {
			if c.LinkedUserID != nil && *c.LinkedUserID == requesterUserID {
				// Already have a reciprocal contact — just update its status
				err = s.repo.UpdateContactLinkStatus(ctx, c.ID, "ACCEPTED")
				if err != nil {
					return err
				}
				alreadyLinked = true
				break
			}
		}

		if !alreadyLinked {
			// Get requester's email for the new contact
			requester, err := s.userRepo.GetByID(ctx, requesterUserID)
			if err != nil {
				return err
			}

			// Use provided name or default to requester's member name
			name := contactName
			if name == "" {
				// Find requester's display name from their household
				for _, m := range members {
					if m.UserID == requesterUserID {
						name = m.UserName
						break
					}
				}
			}
			if name == "" {
				name = contact.Name // last resort: name the requester gave this contact
			}

			now := time.Now()
			newContact := &Contact{
				HouseholdID:     acceptorHouseholdID,
				Name:            name,
				Email:           &requester.Email,
				LinkedUserID:    &requesterUserID,
				LinkStatus:      "ACCEPTED",
				LinkRequestedAt: &now,
				LinkRespondedAt: &now,
				IsActive:        true,
			}
			_, err = s.repo.CreateContact(ctx, newContact)
			if err != nil {
				return err
			}
		}
	}

	// 5. Update source contact to ACCEPTED
	return s.repo.UpdateContactLinkStatus(ctx, contactID, "ACCEPTED")
}

// RejectLinkRequest rejects a pending link request
func (s *Service) RejectLinkRequest(ctx context.Context, userID, contactID string) error {
	// Verify the contact exists and is linked to this user
	contact, err := s.repo.GetContact(ctx, contactID)
	if err != nil {
		return err
	}

	if contact.LinkedUserID == nil || *contact.LinkedUserID != userID {
		return ErrNotAuthorized
	}

	if contact.LinkStatus != "PENDING" {
		return ErrLinkRequestNotPending
	}

	// Set status to REJECTED (keep linked_user_id so re-requesting is possible)
	return s.repo.UpdateContactLinkStatus(ctx, contactID, "REJECTED")
}
