package households

import (
	"context"
	"time"

	"github.com/blanquicet/gastos/backend/internal/auth"
)

// MockHouseholdRepository is a mock implementation for testing
type MockHouseholdRepository struct {
	households  map[string]*Household
	members     map[string][]*HouseholdMember
	contacts    map[string][]*Contact
	invitations map[string]*HouseholdInvitation
}

// NewMockRepository creates a new mock repository
func NewMockRepository() *MockHouseholdRepository {
	return &MockHouseholdRepository{
		households:  make(map[string]*Household),
		members:     make(map[string][]*HouseholdMember),
		contacts:    make(map[string][]*Contact),
		invitations: make(map[string]*HouseholdInvitation),
	}
}

func (m *MockHouseholdRepository) Create(ctx context.Context, name, createdBy string) (*Household, error) {
	h := &Household{
		ID:        "household-1",
		Name:      name,
		CreatedBy: createdBy,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Currency:  "COP",
		Timezone:  "America/Bogota",
	}
	m.households[h.ID] = h
	
	// Add creator as owner
	member := &HouseholdMember{
		ID:          "member-1",
		HouseholdID: h.ID,
		UserID:      createdBy,
		Role:        RoleOwner,
		JoinedAt:    time.Now(),
	}
	m.members[h.ID] = append(m.members[h.ID], member)
	
	return h, nil
}

func (m *MockHouseholdRepository) GetByID(ctx context.Context, id string) (*Household, error) {
	h, ok := m.households[id]
	if !ok {
		return nil, ErrHouseholdNotFound
	}
	return h, nil
}

func (m *MockHouseholdRepository) Update(ctx context.Context, id, name string) (*Household, error) {
	h, ok := m.households[id]
	if !ok {
		return nil, ErrHouseholdNotFound
	}
	h.Name = name
	h.UpdatedAt = time.Now()
	return h, nil
}

func (m *MockHouseholdRepository) Delete(ctx context.Context, id string) error {
	if _, ok := m.households[id]; !ok {
		return ErrHouseholdNotFound
	}
	delete(m.households, id)
	delete(m.members, id)
	delete(m.contacts, id)
	return nil
}

func (m *MockHouseholdRepository) ListByUser(ctx context.Context, userID string) ([]*Household, error) {
	var result []*Household
	for hID, members := range m.members {
		for _, member := range members {
			if member.UserID == userID {
				if h, ok := m.households[hID]; ok {
					result = append(result, h)
				}
				break
			}
		}
	}
	return result, nil
}

func (m *MockHouseholdRepository) AddMember(ctx context.Context, householdID, userID string, role HouseholdRole) (*HouseholdMember, error) {
	// Check if already member
	for _, member := range m.members[householdID] {
		if member.UserID == userID {
			return nil, ErrUserAlreadyMember
		}
	}
	
	member := &HouseholdMember{
		ID:          "member-new",
		HouseholdID: householdID,
		UserID:      userID,
		Role:        role,
		JoinedAt:    time.Now(),
	}
	m.members[householdID] = append(m.members[householdID], member)
	return member, nil
}

func (m *MockHouseholdRepository) RemoveMember(ctx context.Context, householdID, userID string) error {
	members := m.members[householdID]
	for i, member := range members {
		if member.UserID == userID {
			m.members[householdID] = append(members[:i], members[i+1:]...)
			return nil
		}
	}
	return ErrMemberNotFound
}

func (m *MockHouseholdRepository) UpdateMemberRole(ctx context.Context, householdID, userID string, role HouseholdRole) (*HouseholdMember, error) {
	for _, member := range m.members[householdID] {
		if member.UserID == userID {
			member.Role = role
			return member, nil
		}
	}
	return nil, ErrMemberNotFound
}

func (m *MockHouseholdRepository) GetMembers(ctx context.Context, householdID string) ([]*HouseholdMember, error) {
	return m.members[householdID], nil
}

func (m *MockHouseholdRepository) GetMemberByUserID(ctx context.Context, householdID, userID string) (*HouseholdMember, error) {
	for _, member := range m.members[householdID] {
		if member.UserID == userID {
			return member, nil
		}
	}
	return nil, ErrMemberNotFound
}

func (m *MockHouseholdRepository) CountOwners(ctx context.Context, householdID string) (int, error) {
	count := 0
	for _, member := range m.members[householdID] {
		if member.Role == RoleOwner {
			count++
		}
	}
	return count, nil
}

func (m *MockHouseholdRepository) CreateContact(ctx context.Context, contact *Contact) (*Contact, error) {
	c := &Contact{
		ID:           "contact-new",
		HouseholdID:  contact.HouseholdID,
		Name:         contact.Name,
		Email:        contact.Email,
		Phone:        contact.Phone,
		LinkedUserID: contact.LinkedUserID,
		Notes:        contact.Notes,
		IsActive:     contact.IsActive,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
		IsRegistered: contact.LinkedUserID != nil,
	}
	m.contacts[c.HouseholdID] = append(m.contacts[c.HouseholdID], c)
	return c, nil
}

func (m *MockHouseholdRepository) GetContact(ctx context.Context, id string) (*Contact, error) {
	for _, contacts := range m.contacts {
		for _, c := range contacts {
			if c.ID == id {
				return c, nil
			}
		}
	}
	return nil, ErrContactNotFound
}

func (m *MockHouseholdRepository) UpdateContact(ctx context.Context, contact *Contact, isActive *bool) (*Contact, error) {
	for _, contacts := range m.contacts {
		for i, c := range contacts {
			if c.ID == contact.ID {
				contact.UpdatedAt = time.Now()
				contact.IsRegistered = contact.LinkedUserID != nil
				if isActive != nil {
					contact.IsActive = *isActive
				} else {
					contact.IsActive = c.IsActive // Keep existing value
				}
				contacts[i] = contact
				return contact, nil
			}
		}
	}
	return nil, ErrContactNotFound
}

func (m *MockHouseholdRepository) DeleteContact(ctx context.Context, id string) error {
	for hID, contacts := range m.contacts {
		for i, c := range contacts {
			if c.ID == id {
				m.contacts[hID] = append(contacts[:i], contacts[i+1:]...)
				return nil
			}
		}
	}
	return ErrContactNotFound
}

func (m *MockHouseholdRepository) ListContacts(ctx context.Context, householdID string) ([]*Contact, error) {
	return m.contacts[householdID], nil
}

func (m *MockHouseholdRepository) FindContactByEmail(ctx context.Context, householdID, email string) (*Contact, error) {
	for _, c := range m.contacts[householdID] {
		if c.Email != nil && *c.Email == email {
			return c, nil
		}
	}
	return nil, ErrContactNotFound
}

func (m *MockHouseholdRepository) CreateInvitation(ctx context.Context, householdID, email, token, invitedBy string) (*HouseholdInvitation, error) {
	inv := &HouseholdInvitation{
		ID:          "invitation-new",
		HouseholdID: householdID,
		Email:       email,
		Token:       token,
		InvitedBy:   invitedBy,
		CreatedAt:   time.Now(),
	}
	m.invitations[token] = inv
	return inv, nil
}

func (m *MockHouseholdRepository) GetInvitationByToken(ctx context.Context, token string) (*HouseholdInvitation, error) {
	inv, ok := m.invitations[token]
	if !ok {
		return nil, ErrInvitationNotFound
	}
	return inv, nil
}

func (m *MockHouseholdRepository) AcceptInvitation(ctx context.Context, id string) error {
	for _, inv := range m.invitations {
		if inv.ID == id {
			now := time.Now()
			inv.AcceptedAt = &now
			return nil
		}
	}
	return ErrInvitationNotFound
}

func (m *MockHouseholdRepository) ListPendingInvitations(ctx context.Context, householdID string) ([]*HouseholdInvitation, error) {
	var result []*HouseholdInvitation
	for _, inv := range m.invitations {
		if inv.HouseholdID == householdID && inv.AcceptedAt == nil {
			result = append(result, inv)
		}
	}
	return result, nil
}

// MockUserRepository is a mock implementation for testing
type MockUserRepository struct {
	users map[string]*auth.User
}

// NewMockUserRepository creates a new mock user repository
func NewMockUserRepository() *MockUserRepository {
	return &MockUserRepository{
		users: make(map[string]*auth.User),
	}
}

func (m *MockUserRepository) Create(ctx context.Context, email, name, passwordHash string) (*auth.User, error) {
	user := &auth.User{
		ID:           "user-new",
		Email:        email,
		Name:         name,
		PasswordHash: passwordHash,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	m.users[user.ID] = user
	return user, nil
}

func (m *MockUserRepository) GetByID(ctx context.Context, id string) (*auth.User, error) {
	user, ok := m.users[id]
	if !ok {
		return nil, auth.ErrUserNotFound
	}
	return user, nil
}

func (m *MockUserRepository) GetByEmail(ctx context.Context, email string) (*auth.User, error) {
	for _, user := range m.users {
		if user.Email == email {
			return user, nil
		}
	}
	return nil, auth.ErrUserNotFound
}

func (m *MockUserRepository) UpdatePassword(ctx context.Context, id, passwordHash string) error {
	user, ok := m.users[id]
	if !ok {
		return auth.ErrUserNotFound
	}
	user.PasswordHash = passwordHash
	return nil
}

func (m *MockUserRepository) Delete(ctx context.Context, id string) error {
	if _, ok := m.users[id]; !ok {
		return auth.ErrUserNotFound
	}
	delete(m.users, id)
	return nil
}

// AddTestUser is a helper to add users for testing
func (m *MockUserRepository) AddTestUser(id, email, name string) *auth.User {
	user := &auth.User{
		ID:           id,
		Email:        email,
		Name:         name,
		PasswordHash: "hash",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	m.users[id] = user
	return user
}
