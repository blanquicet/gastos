package households

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// Service handles household business logic
type Service struct {
	repo      HouseholdRepository
	userRepo  auth.UserRepository
}

// NewService creates a new household service
func NewService(repo HouseholdRepository, userRepo auth.UserRepository) *Service {
	return &Service{
		repo:     repo,
		userRepo: userRepo,
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
	return s.repo.Create(ctx, input.Name, input.UserID)
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

	return s.repo.Update(ctx, input.HouseholdID, input.Name)
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

	return s.repo.Delete(ctx, householdID)
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
	return s.repo.AddMember(ctx, input.HouseholdID, user.ID, RoleMember)
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

	return s.repo.RemoveMember(ctx, input.HouseholdID, input.MemberID)
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
	}

	// Auto-link if email matches a registered user
	if input.Email != nil && *input.Email != "" {
		user, err := s.userRepo.GetByEmail(ctx, *input.Email)
		if err == nil {
			// User found, link to contact
			contact.LinkedUserID = &user.ID
		}
		// Ignore error if user not found - contact will be unlinked
	}

	return s.repo.CreateContact(ctx, contact)
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

	// Auto-link if email matches a registered user
	if input.Email != nil && *input.Email != "" {
		user, err := s.userRepo.GetByEmail(ctx, *input.Email)
		if err == nil {
			contact.LinkedUserID = &user.ID
		}
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

// PromoteContactInput contains the data needed to promote a contact to member
type PromoteContactInput struct {
	ContactID   string
	HouseholdID string
	UserID      string // User making the request
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

	// Phase 2: Auto-accept for existing users
	// Check if user exists with this email
	invitedUser, err := s.userRepo.GetByEmail(ctx, input.Email)
	if err == nil && invitedUser != nil {
		// User exists - add them directly as a member
		addInput := &AddMemberInput{
			HouseholdID: input.HouseholdID,
			Email:       input.Email,
			UserID:      input.UserID, // Requester
		}
		member, err := s.AddMember(ctx, addInput)
		if err != nil {
			// If they're already a member, return error
			return nil, err
		}
		
		// Successfully added - return a pseudo-invitation indicating auto-acceptance
		return &HouseholdInvitation{
			ID:          member.ID, // Use member ID so we know it was added
			HouseholdID: input.HouseholdID,
			Email:       input.Email,
			InvitedBy:   input.UserID,
		}, nil
	}

	// User doesn't exist - create invitation for Phase 3 email flow
	// Generate token
	token, err := GenerateInvitationToken()
	if err != nil {
		return nil, err
	}

	return s.repo.CreateInvitation(ctx, input.HouseholdID, input.Email, token, input.UserID)
}
