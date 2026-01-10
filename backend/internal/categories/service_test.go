package categories

import (
"context"
"testing"
"time"

"github.com/blanquicet/gastos/backend/internal/households"
)

// MockRepository implements Repository for testing
type MockRepository struct {
categories map[string]*Category
nextID     int
}

func NewMockRepository() *MockRepository {
return &MockRepository{
categories: make(map[string]*Category),
nextID:     1,
}
}

func (m *MockRepository) Create(ctx context.Context, householdID string, input *CreateCategoryInput) (*Category, error) {
for _, cat := range m.categories {
if cat.HouseholdID == householdID && cat.Name == input.Name && cat.IsActive {
return nil, ErrCategoryNameExists
}
}

cat := &Category{
ID:            generateID(m.nextID),
HouseholdID:   householdID,
Name:          input.Name,
CategoryGroup: input.CategoryGroup,
Icon:          input.Icon,
Color:         input.Color,
DisplayOrder:  m.nextID,
IsActive:      true,
}
m.nextID++
m.categories[cat.ID] = cat
return cat, nil
}

func (m *MockRepository) GetByID(ctx context.Context, id string) (*Category, error) {
cat, ok := m.categories[id]
if !ok {
return nil, ErrCategoryNotFound
}
return cat, nil
}

func (m *MockRepository) Update(ctx context.Context, id string, input *UpdateCategoryInput) (*Category, error) {
cat, ok := m.categories[id]
if !ok {
return nil, ErrCategoryNotFound
}

if input.Name != nil {
for _, c := range m.categories {
if c.HouseholdID == cat.HouseholdID && c.ID != id && c.Name == *input.Name && c.IsActive {
return nil, ErrCategoryNameExists
}
}
cat.Name = *input.Name
}

if input.CategoryGroup != nil {
cat.CategoryGroup = input.CategoryGroup
}
if input.Icon != nil {
cat.Icon = input.Icon
}
if input.Color != nil {
cat.Color = input.Color
}
if input.DisplayOrder != nil {
cat.DisplayOrder = *input.DisplayOrder
}
if input.IsActive != nil {
cat.IsActive = *input.IsActive
}

return cat, nil
}

func (m *MockRepository) ListByHousehold(ctx context.Context, householdID string, includeInactive bool) ([]*Category, error) {
var result []*Category
for _, cat := range m.categories {
if cat.HouseholdID == householdID {
if includeInactive || cat.IsActive {
result = append(result, cat)
}
}
}
return result, nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
if _, ok := m.categories[id]; !ok {
return ErrCategoryNotFound
}
delete(m.categories, id)
return nil
}

func (m *MockRepository) CheckNameExists(ctx context.Context, householdID, name, excludeID string) (bool, error) {
for _, cat := range m.categories {
if cat.HouseholdID == householdID && cat.Name == name && cat.ID != excludeID && cat.IsActive {
return true, nil
}
}
return false, nil
}

func (m *MockRepository) IsUsedInMovements(ctx context.Context, categoryID string) (bool, error) {
return false, nil
}

func (m *MockRepository) Reorder(ctx context.Context, householdID string, categoryIDs []string) error {
return nil
}

func (m *MockRepository) CreateDefaultCategories(ctx context.Context, householdID string) error {
return nil
}

// MockHouseholdRepository is a minimal mock for testing
type MockHouseholdRepository struct {
members map[string]map[string]households.HouseholdRole
}

func NewMockHouseholdRepository() *MockHouseholdRepository {
return &MockHouseholdRepository{
members: make(map[string]map[string]households.HouseholdRole),
}
}

func (m *MockHouseholdRepository) AddTestMember(householdID, userID string, role households.HouseholdRole) {
if m.members[householdID] == nil {
m.members[householdID] = make(map[string]households.HouseholdRole)
}
m.members[householdID][userID] = role
}

func (m *MockHouseholdRepository) GetMemberByUserID(ctx context.Context, householdID, userID string) (*households.HouseholdMember, error) {
if members, ok := m.members[householdID]; ok {
if role, ok := members[userID]; ok {
return &households.HouseholdMember{
ID:          "member-" + userID,
HouseholdID: householdID,
UserID:      userID,
Role:        role,
JoinedAt:    time.Now(),
}, nil
}
}
return nil, households.ErrMemberNotFound
}

func (m *MockHouseholdRepository) GetUserHouseholdID(ctx context.Context, userID string) (string, error) {
for hID, members := range m.members {
if _, ok := members[userID]; ok {
return hID, nil
}
}
return "", households.ErrHouseholdNotFound
}

// Stub implementations for interface compliance
func (m *MockHouseholdRepository) Create(ctx context.Context, name, createdBy string) (*households.Household, error) { return nil, nil }
func (m *MockHouseholdRepository) GetByID(ctx context.Context, id string) (*households.Household, error) { return nil, nil }
func (m *MockHouseholdRepository) Update(ctx context.Context, id, name string) (*households.Household, error) { return nil, nil }
func (m *MockHouseholdRepository) Delete(ctx context.Context, id string) error { return nil }
func (m *MockHouseholdRepository) ListByUser(ctx context.Context, userID string) ([]*households.Household, error) {
for hID, members := range m.members {
if _, ok := members[userID]; ok {
return []*households.Household{{ID: hID}}, nil
}
}
return nil, nil
}
func (m *MockHouseholdRepository) AddMember(ctx context.Context, householdID, userID string, role households.HouseholdRole) (*households.HouseholdMember, error) { return nil, nil }
func (m *MockHouseholdRepository) RemoveMember(ctx context.Context, householdID, userID string) error { return nil }
func (m *MockHouseholdRepository) UpdateMemberRole(ctx context.Context, householdID, userID string, role households.HouseholdRole) (*households.HouseholdMember, error) { return nil, nil }
func (m *MockHouseholdRepository) GetMembers(ctx context.Context, householdID string) ([]*households.HouseholdMember, error) { return nil, nil }
func (m *MockHouseholdRepository) CountOwners(ctx context.Context, householdID string) (int, error) { return 0, nil }
func (m *MockHouseholdRepository) CreateContact(ctx context.Context, contact *households.Contact) (*households.Contact, error) { return nil, nil }
func (m *MockHouseholdRepository) GetContact(ctx context.Context, id string) (*households.Contact, error) { return nil, nil }
func (m *MockHouseholdRepository) UpdateContact(ctx context.Context, contact *households.Contact, isActive *bool) (*households.Contact, error) { return nil, nil }
func (m *MockHouseholdRepository) DeleteContact(ctx context.Context, id string) error { return nil }
func (m *MockHouseholdRepository) ListContacts(ctx context.Context, householdID string) ([]*households.Contact, error) { return nil, nil }
func (m *MockHouseholdRepository) FindContactByEmail(ctx context.Context, householdID, email string) (*households.Contact, error) { return nil, nil }
func (m *MockHouseholdRepository) CreateInvitation(ctx context.Context, householdID, email, token, invitedBy string) (*households.HouseholdInvitation, error) { return nil, nil }
func (m *MockHouseholdRepository) GetInvitationByToken(ctx context.Context, token string) (*households.HouseholdInvitation, error) { return nil, nil }
func (m *MockHouseholdRepository) AcceptInvitation(ctx context.Context, id string) error { return nil }
func (m *MockHouseholdRepository) ListPendingInvitations(ctx context.Context, householdID string) ([]*households.HouseholdInvitation, error) { return nil, nil }
func (m *MockHouseholdRepository) IsUserMember(ctx context.Context, householdID, userID string) (bool, error) {
if members, ok := m.members[householdID]; ok {
_, ok := members[userID]
return ok, nil
}
return false, nil
}

func generateID(n int) string {
return "cat-" + string(rune('0'+n))
}

func strPtr(s string) *string {
return &s
}

// Tests
func TestCreateCategory(t *testing.T) {
repo := NewMockRepository()
householdRepo := NewMockHouseholdRepository()
householdRepo.AddTestMember("household1", "user1", households.RoleOwner)

svc := NewService(repo, householdRepo)

cat, err := svc.Create(context.Background(), "user1", &CreateCategoryInput{
Name:          "Groceries",
CategoryGroup: strPtr("Casa"),
Icon:          strPtr("🛒"),
})

if err != nil {
t.Errorf("Create() error = %v", err)
}
if cat.Name != "Groceries" {
t.Errorf("Create() got name = %v, want %v", cat.Name, "Groceries")
}
}

func TestUpdateCategoryRename(t *testing.T) {
repo := NewMockRepository()
householdRepo := NewMockHouseholdRepository()
householdRepo.AddTestMember("household1", "user1", households.RoleOwner)

cat, _ := repo.Create(context.Background(), "household1", &CreateCategoryInput{
Name:          "Groceries",
CategoryGroup: strPtr("Casa"),
})

svc := NewService(repo, householdRepo)

updated, err := svc.Update(context.Background(), "user1", cat.ID, &UpdateCategoryInput{
Name: strPtr("Supermarket"),
})

if err != nil {
t.Errorf("Update() error = %v", err)
}
if updated.Name != "Supermarket" {
t.Errorf("Update() got name = %v, want %v", updated.Name, "Supermarket")
}
}

func TestListCategories(t *testing.T) {
repo := NewMockRepository()
householdRepo := NewMockHouseholdRepository()
householdRepo.AddTestMember("household1", "user1", households.RoleOwner)

repo.Create(context.Background(), "household1", &CreateCategoryInput{
Name:          "Groceries",
CategoryGroup: strPtr("Casa"),
})
repo.Create(context.Background(), "household1", &CreateCategoryInput{
Name:          "Utilities",
CategoryGroup: strPtr("Casa"),
})

svc := NewService(repo, householdRepo)
response, err := svc.ListByHousehold(context.Background(), "user1", false)

if err != nil {
t.Errorf("ListByHousehold() error = %v", err)
}
if len(response.Categories) != 2 {
t.Errorf("ListByHousehold() returned %d categories, want 2", len(response.Categories))
}
}
