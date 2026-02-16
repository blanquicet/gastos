package creditcardpayments

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/blanquicet/conti/backend/internal/accounts"
	"github.com/blanquicet/conti/backend/internal/audit"
	"github.com/blanquicet/conti/backend/internal/households"
	"github.com/blanquicet/conti/backend/internal/paymentmethods"
)

// MockRepository implements Repository for testing
type MockRepository struct {
	payments map[string]*CreditCardPayment
	nextID   int
}

func NewMockRepository() *MockRepository {
	return &MockRepository{
		payments: make(map[string]*CreditCardPayment),
		nextID:   1,
	}
}

func (m *MockRepository) Create(ctx context.Context, payment *CreditCardPayment) (*CreditCardPayment, error) {
	payment.ID = generateID(m.nextID)
	payment.CreatedAt = time.Now()
	payment.UpdatedAt = time.Now()
	m.nextID++
	m.payments[payment.ID] = payment
	return payment, nil
}

func (m *MockRepository) GetByID(ctx context.Context, id string) (*CreditCardPayment, error) {
	payment, ok := m.payments[id]
	if !ok {
		return nil, ErrPaymentNotFound
	}
	return payment, nil
}

func (m *MockRepository) Delete(ctx context.Context, id string) error {
	if _, ok := m.payments[id]; !ok {
		return ErrPaymentNotFound
	}
	delete(m.payments, id)
	return nil
}

func (m *MockRepository) ListByHousehold(ctx context.Context, householdID string, filter *ListFilter) (*ListResponse, error) {
	var result []*CreditCardPayment
	var total float64
	for _, p := range m.payments {
		if p.HouseholdID == householdID {
			if filter != nil && filter.CreditCardID != nil && p.CreditCardID != *filter.CreditCardID {
				continue
			}
			if filter != nil && filter.StartDate != nil && p.PaymentDate.Before(*filter.StartDate) {
				continue
			}
			if filter != nil && filter.EndDate != nil && p.PaymentDate.After(*filter.EndDate) {
				continue
			}
			result = append(result, p)
			total += p.Amount
		}
	}
	return &ListResponse{Payments: result, Total: total}, nil
}

// MockHouseholdRepository for testing
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

func (m *MockHouseholdRepository) GetUserHouseholdID(ctx context.Context, userID string) (string, error) {
	for hID, members := range m.members {
		if _, ok := members[userID]; ok {
			return hID, nil
		}
	}
	return "", households.ErrHouseholdNotFound
}

// Stub implementations for interface compliance
func (m *MockHouseholdRepository) Create(ctx context.Context, name, createdBy string) (*households.Household, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) GetByID(ctx context.Context, id string) (*households.Household, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) Update(ctx context.Context, id, name string) (*households.Household, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) Delete(ctx context.Context, id string) error { return nil }
func (m *MockHouseholdRepository) ListByUser(ctx context.Context, userID string) ([]*households.Household, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) AddMember(ctx context.Context, householdID, userID string, role households.HouseholdRole) (*households.HouseholdMember, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) RemoveMember(ctx context.Context, householdID, userID string) error {
	return nil
}
func (m *MockHouseholdRepository) UpdateMemberRole(ctx context.Context, householdID, userID string, role households.HouseholdRole) (*households.HouseholdMember, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) GetMembers(ctx context.Context, householdID string) ([]*households.HouseholdMember, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) GetMemberByUserID(ctx context.Context, householdID, userID string) (*households.HouseholdMember, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) CountOwners(ctx context.Context, householdID string) (int, error) {
	return 0, nil
}
func (m *MockHouseholdRepository) CreateContact(ctx context.Context, contact *households.Contact) (*households.Contact, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) GetContact(ctx context.Context, id string) (*households.Contact, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) UpdateContact(ctx context.Context, contact *households.Contact, isActive *bool) (*households.Contact, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) DeleteContact(ctx context.Context, id string) error { return nil }
func (m *MockHouseholdRepository) ListContacts(ctx context.Context, householdID string) ([]*households.Contact, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) FindContactByEmail(ctx context.Context, householdID, email string) (*households.Contact, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) CreateInvitation(ctx context.Context, householdID, email, token, invitedBy string) (*households.HouseholdInvitation, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) GetInvitationByToken(ctx context.Context, token string) (*households.HouseholdInvitation, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) AcceptInvitation(ctx context.Context, id string) error { return nil }
func (m *MockHouseholdRepository) ListPendingInvitations(ctx context.Context, householdID string) ([]*households.HouseholdInvitation, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) IsUserMember(ctx context.Context, householdID, userID string) (bool, error) {
	return false, nil
}
func (m *MockHouseholdRepository) FindLinkedContactsByHousehold(ctx context.Context, householdID string) ([]households.LinkedContact, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) ListPendingLinkRequests(ctx context.Context, userID string) ([]households.LinkRequest, error) {
	return nil, nil
}
func (m *MockHouseholdRepository) CountPendingLinkRequests(ctx context.Context, userID string) (int, error) {
	return 0, nil
}
func (m *MockHouseholdRepository) UpdateContactLinkStatus(ctx context.Context, contactID string, status string) error {
	return nil
}
func (m *MockHouseholdRepository) UpdateContactLinkedUser(ctx context.Context, contactID string, linkedUserID string, linkStatus string) error {
	return nil
}
func (m *MockHouseholdRepository) UnlinkContact(ctx context.Context, contactID string) error {
	return nil
}
func (m *MockHouseholdRepository) SetWasUnlinkedAt(ctx context.Context, contactID string) error {
	return nil
}
func (m *MockHouseholdRepository) DismissUnlinkBanner(ctx context.Context, contactID string) error {
	return nil
}
func (m *MockHouseholdRepository) FindContactByLinkedUserID(ctx context.Context, householdID string, linkedUserID string) (*households.Contact, error) {
	return nil, households.ErrContactNotFound
}

// MockPaymentMethodsRepository for testing
type MockPaymentMethodsRepository struct {
	paymentMethods map[string]*paymentmethods.PaymentMethod
}

func NewMockPaymentMethodsRepository() *MockPaymentMethodsRepository {
	return &MockPaymentMethodsRepository{
		paymentMethods: make(map[string]*paymentmethods.PaymentMethod),
	}
}

func (m *MockPaymentMethodsRepository) AddTestCard(id, householdID, name string, pmType paymentmethods.PaymentMethodType) {
	m.paymentMethods[id] = &paymentmethods.PaymentMethod{
		ID:          id,
		HouseholdID: householdID,
		Name:        name,
		Type:        pmType,
		IsActive:    true,
	}
}

func (m *MockPaymentMethodsRepository) GetByID(ctx context.Context, id string) (*paymentmethods.PaymentMethod, error) {
	pm, ok := m.paymentMethods[id]
	if !ok {
		return nil, paymentmethods.ErrPaymentMethodNotFound
	}
	return pm, nil
}

// Stub implementations
func (m *MockPaymentMethodsRepository) Create(ctx context.Context, pm *paymentmethods.PaymentMethod) (*paymentmethods.PaymentMethod, error) {
	return nil, nil
}
func (m *MockPaymentMethodsRepository) Update(ctx context.Context, pm *paymentmethods.PaymentMethod) (*paymentmethods.PaymentMethod, error) {
	return nil, nil
}
func (m *MockPaymentMethodsRepository) Delete(ctx context.Context, id string) error { return nil }
func (m *MockPaymentMethodsRepository) ListByHousehold(ctx context.Context, householdID string) ([]*paymentmethods.PaymentMethod, error) {
	return nil, nil
}
func (m *MockPaymentMethodsRepository) CheckNameExists(ctx context.Context, householdID, name, excludeID string) (bool, error) {
	return false, nil
}
func (m *MockPaymentMethodsRepository) GetHouseholdID(ctx context.Context, paymentMethodID string) (string, error) {
	pm, ok := m.paymentMethods[paymentMethodID]
	if !ok {
		return "", paymentmethods.ErrPaymentMethodNotFound
	}
	return pm.HouseholdID, nil
}
func (m *MockPaymentMethodsRepository) FindByName(ctx context.Context, householdID, name string) (*paymentmethods.PaymentMethod, error) {
	for _, pm := range m.paymentMethods {
		if pm.HouseholdID == householdID && pm.Name == name {
			return pm, nil
		}
	}
	return nil, paymentmethods.ErrPaymentMethodNotFound
}

// MockAccountsRepository for testing
type MockAccountsRepository struct {
	accounts map[string]*accounts.Account
}

func NewMockAccountsRepository() *MockAccountsRepository {
	return &MockAccountsRepository{
		accounts: make(map[string]*accounts.Account),
	}
}

func (m *MockAccountsRepository) AddTestAccount(id, householdID, name string, accType accounts.AccountType) {
	m.accounts[id] = &accounts.Account{
		ID:          id,
		HouseholdID: householdID,
		Name:        name,
		Type:        accType,
	}
}

func (m *MockAccountsRepository) GetByID(ctx context.Context, id string) (*accounts.Account, error) {
	acc, ok := m.accounts[id]
	if !ok {
		return nil, accounts.ErrAccountNotFound
	}
	return acc, nil
}

// Stub implementations
func (m *MockAccountsRepository) Create(ctx context.Context, account *accounts.Account) (*accounts.Account, error) {
	return nil, nil
}
func (m *MockAccountsRepository) Update(ctx context.Context, account *accounts.Account) (*accounts.Account, error) {
	return nil, nil
}
func (m *MockAccountsRepository) Delete(ctx context.Context, id string) error { return nil }
func (m *MockAccountsRepository) ListByHousehold(ctx context.Context, householdID string) ([]*accounts.Account, error) {
	return nil, nil
}
func (m *MockAccountsRepository) FindByName(ctx context.Context, householdID, name string) (*accounts.Account, error) {
	for _, acc := range m.accounts {
		if acc.HouseholdID == householdID && acc.Name == name {
			return acc, nil
		}
	}
	return nil, accounts.ErrAccountNotFound
}
func (m *MockAccountsRepository) GetBalance(ctx context.Context, id string) (float64, error) {
	return 0, nil
}

// MockAuditService for testing
type MockAuditService struct{}

func (m *MockAuditService) Log(ctx context.Context, input *audit.LogInput) error { return nil }
func (m *MockAuditService) LogAsync(ctx context.Context, input *audit.LogInput)  {}
func (m *MockAuditService) LogFromRequest(r *http.Request, input *audit.LogInput) error {
	return nil
}
func (m *MockAuditService) Query(ctx context.Context, filters *audit.ListFilters) ([]*audit.AuditLog, int, error) {
	return nil, 0, nil
}
func (m *MockAuditService) Cleanup(ctx context.Context, retentionDays int) (int64, error) {
	return 0, nil
}

func generateID(n int) string {
	return "payment-" + string(rune('0'+n))
}

// Tests

func TestCreateInput_Validate(t *testing.T) {
	validInput := &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}

	if err := validInput.Validate(); err != nil {
		t.Errorf("Validate() with valid input returned error: %v", err)
	}

	// Test missing credit card ID
	invalidInput := &CreateInput{
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}
	if err := invalidInput.Validate(); err == nil {
		t.Error("Validate() without credit_card_id should return error")
	}

	// Test invalid amount
	invalidInput = &CreateInput{
		CreditCardID:    "card-1",
		Amount:          0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}
	if err := invalidInput.Validate(); err != ErrInvalidAmount {
		t.Errorf("Validate() with zero amount should return ErrInvalidAmount, got %v", err)
	}

	// Test negative amount
	invalidInput = &CreateInput{
		CreditCardID:    "card-1",
		Amount:          -50.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}
	if err := invalidInput.Validate(); err != ErrInvalidAmount {
		t.Errorf("Validate() with negative amount should return ErrInvalidAmount, got %v", err)
	}

	// Test missing source account
	invalidInput = &CreateInput{
		CreditCardID: "card-1",
		Amount:       100.0,
		PaymentDate:  time.Now(),
	}
	if err := invalidInput.Validate(); err == nil {
		t.Error("Validate() without source_account_id should return error")
	}

	// Test missing payment date
	invalidInput = &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		SourceAccountID: "account-1",
	}
	if err := invalidInput.Validate(); err == nil {
		t.Error("Validate() without payment_date should return error")
	}
}

func TestCreate_Success(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)
	pmRepo.AddTestCard("card-1", "household-1", "AMEX", paymentmethods.TypeCreditCard)
	accRepo.AddTestAccount("account-1", "household-1", "Savings", accounts.TypeSavings)

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	input := &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}

	payment, err := svc.Create(context.Background(), "user-1", input)
	if err != nil {
		t.Errorf("Create() error = %v", err)
	}
	if payment.Amount != 100.0 {
		t.Errorf("Create() amount = %v, want 100.0", payment.Amount)
	}
	if payment.CreditCardName != "AMEX" {
		t.Errorf("Create() credit card name = %v, want AMEX", payment.CreditCardName)
	}
	if payment.SourceAccountName != "Savings" {
		t.Errorf("Create() source account name = %v, want Savings", payment.SourceAccountName)
	}
}

func TestCreate_CreditCardNotFound(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)
	accRepo.AddTestAccount("account-1", "household-1", "Savings", accounts.TypeSavings)
	// Note: no credit card added

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	input := &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}

	_, err := svc.Create(context.Background(), "user-1", input)
	if err != ErrCreditCardNotFound {
		t.Errorf("Create() error = %v, want ErrCreditCardNotFound", err)
	}
}

func TestCreate_NotACreditCard(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)
	pmRepo.AddTestCard("card-1", "household-1", "Debit Card", paymentmethods.TypeDebitCard) // Not a credit card
	accRepo.AddTestAccount("account-1", "household-1", "Savings", accounts.TypeSavings)

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	input := &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}

	_, err := svc.Create(context.Background(), "user-1", input)
	if err != ErrNotACreditCard {
		t.Errorf("Create() error = %v, want ErrNotACreditCard", err)
	}
}

func TestCreate_SourceAccountNotSavings(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)
	pmRepo.AddTestCard("card-1", "household-1", "AMEX", paymentmethods.TypeCreditCard)
	accRepo.AddTestAccount("account-1", "household-1", "Checking", accounts.TypeChecking) // Checking account

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	input := &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}

	_, err := svc.Create(context.Background(), "user-1", input)
	if err != ErrSourceMustBeSavings {
		t.Errorf("Create() error = %v, want ErrSourceMustBeSavings", err)
	}
}

func TestCreate_NotAuthorized_DifferentHousehold(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)
	pmRepo.AddTestCard("card-1", "household-2", "AMEX", paymentmethods.TypeCreditCard) // Different household
	accRepo.AddTestAccount("account-1", "household-1", "Savings", accounts.TypeSavings)

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	input := &CreateInput{
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
	}

	_, err := svc.Create(context.Background(), "user-1", input)
	if err != ErrNotAuthorized {
		t.Errorf("Create() error = %v, want ErrNotAuthorized", err)
	}
}

func TestDelete_Success(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)

	// Create a payment directly in repo
	payment := &CreditCardPayment{
		HouseholdID:     "household-1",
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
		CreatedBy:       "user-1",
	}
	createdPayment, _ := repo.Create(context.Background(), payment)

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	err := svc.Delete(context.Background(), "user-1", createdPayment.ID)
	if err != nil {
		t.Errorf("Delete() error = %v", err)
	}

	// Verify payment was deleted
	_, err = repo.GetByID(context.Background(), createdPayment.ID)
	if err != ErrPaymentNotFound {
		t.Errorf("After Delete(), GetByID should return ErrPaymentNotFound, got %v", err)
	}
}

func TestDelete_NotAuthorized(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)
	householdRepo.AddTestMember("household-2", "user-2", households.RoleOwner)

	// Create a payment in household-2
	payment := &CreditCardPayment{
		HouseholdID:     "household-2",
		CreditCardID:    "card-1",
		Amount:          100.0,
		PaymentDate:     time.Now(),
		SourceAccountID: "account-1",
		CreatedBy:       "user-2",
	}
	createdPayment, _ := repo.Create(context.Background(), payment)

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	// User-1 tries to delete user-2's payment
	err := svc.Delete(context.Background(), "user-1", createdPayment.ID)
	if err != ErrNotAuthorized {
		t.Errorf("Delete() error = %v, want ErrNotAuthorized", err)
	}
}

func TestList_FilterByCreditCard(t *testing.T) {
	repo := NewMockRepository()
	householdRepo := NewMockHouseholdRepository()
	pmRepo := NewMockPaymentMethodsRepository()
	accRepo := NewMockAccountsRepository()
	auditSvc := &MockAuditService{}

	householdRepo.AddTestMember("household-1", "user-1", households.RoleOwner)

	// Create payments for different cards
	repo.Create(context.Background(), &CreditCardPayment{
		HouseholdID:  "household-1",
		CreditCardID: "card-1",
		Amount:       100.0,
		PaymentDate:  time.Now(),
	})
	repo.Create(context.Background(), &CreditCardPayment{
		HouseholdID:  "household-1",
		CreditCardID: "card-2",
		Amount:       200.0,
		PaymentDate:  time.Now(),
	})
	repo.Create(context.Background(), &CreditCardPayment{
		HouseholdID:  "household-1",
		CreditCardID: "card-1",
		Amount:       150.0,
		PaymentDate:  time.Now(),
	})

	svc := NewService(repo, householdRepo, pmRepo, accRepo, auditSvc, nil)

	cardID := "card-1"
	filter := &ListFilter{CreditCardID: &cardID}
	response, err := svc.List(context.Background(), "user-1", filter)

	if err != nil {
		t.Errorf("List() error = %v", err)
	}
	if len(response.Payments) != 2 {
		t.Errorf("List() returned %d payments, want 2", len(response.Payments))
	}
	if response.Total != 250.0 {
		t.Errorf("List() total = %v, want 250.0", response.Total)
	}
}
