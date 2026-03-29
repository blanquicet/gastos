package pockets

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/blanquicet/conti/backend/internal/accounts"
	"github.com/blanquicet/conti/backend/internal/audit"
	"github.com/blanquicet/conti/backend/internal/households"
	"github.com/blanquicet/conti/backend/internal/movements"
)

// ============================================================
// Mocks
// ============================================================

// mockRepository implements Repository with function fields
type mockRepository struct {
	createFn                       func(ctx context.Context, pocket *Pocket) (*Pocket, error)
	getByIDFn                      func(ctx context.Context, id string) (*Pocket, error)
	updateFn                       func(ctx context.Context, pocket *Pocket) (*Pocket, error)
	deactivateFn                   func(ctx context.Context, id string) error
	listByHouseholdFn              func(ctx context.Context, householdID string) ([]*Pocket, error)
	listActiveByHouseholdFn        func(ctx context.Context, householdID string) ([]*Pocket, error)
	countByHouseholdFn             func(ctx context.Context, householdID string) (int, error)
	findByNameFn                   func(ctx context.Context, householdID, name string) (*Pocket, error)
	getBalanceFn                   func(ctx context.Context, id string) (float64, error)
	getBalanceForUpdateFn          func(ctx context.Context, tx any, id string) (float64, error)
	createTransactionFn            func(ctx context.Context, tx *PocketTransaction) (*PocketTransaction, error)
	getTransactionByIDFn           func(ctx context.Context, id string) (*PocketTransaction, error)
	updateTransactionFn            func(ctx context.Context, id string, input *EditTransactionInput) (*PocketTransaction, error)
	deleteTransactionFn            func(ctx context.Context, id string) error
	listTransactionsFn             func(ctx context.Context, pocketID string) ([]*PocketTransaction, error)
	getTransactionByLinkedMovIDFn  func(ctx context.Context, movementID string) (*PocketTransaction, error)
	beginTxFn                      func(ctx context.Context) (any, error)
	commitTxFn                     func(ctx context.Context, tx any) error
	rollbackTxFn                   func(ctx context.Context, tx any) error
	createTransactionInTxFn        func(ctx context.Context, tx any, ptx *PocketTransaction) (*PocketTransaction, error)
}

func (m *mockRepository) Create(ctx context.Context, p *Pocket) (*Pocket, error) {
	if m.createFn != nil {
		return m.createFn(ctx, p)
	}
	p.ID = "pocket-1"
	return p, nil
}
func (m *mockRepository) GetByID(ctx context.Context, id string) (*Pocket, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, ErrPocketNotFound
}
func (m *mockRepository) Update(ctx context.Context, p *Pocket) (*Pocket, error) {
	if m.updateFn != nil {
		return m.updateFn(ctx, p)
	}
	return p, nil
}
func (m *mockRepository) Deactivate(ctx context.Context, id string) error {
	if m.deactivateFn != nil {
		return m.deactivateFn(ctx, id)
	}
	return nil
}
func (m *mockRepository) ListByHousehold(ctx context.Context, hid string) ([]*Pocket, error) {
	if m.listByHouseholdFn != nil {
		return m.listByHouseholdFn(ctx, hid)
	}
	return nil, nil
}
func (m *mockRepository) ListActiveByHousehold(ctx context.Context, hid string) ([]*Pocket, error) {
	if m.listActiveByHouseholdFn != nil {
		return m.listActiveByHouseholdFn(ctx, hid)
	}
	return nil, nil
}
func (m *mockRepository) CountByHousehold(ctx context.Context, hid string) (int, error) {
	if m.countByHouseholdFn != nil {
		return m.countByHouseholdFn(ctx, hid)
	}
	return 0, nil
}
func (m *mockRepository) FindByName(ctx context.Context, hid, name string) (*Pocket, error) {
	if m.findByNameFn != nil {
		return m.findByNameFn(ctx, hid, name)
	}
	return nil, nil
}
func (m *mockRepository) GetBalance(ctx context.Context, id string) (float64, error) {
	if m.getBalanceFn != nil {
		return m.getBalanceFn(ctx, id)
	}
	return 0, nil
}
func (m *mockRepository) GetBalanceForUpdate(ctx context.Context, tx any, id string) (float64, error) {
	if m.getBalanceForUpdateFn != nil {
		return m.getBalanceForUpdateFn(ctx, tx, id)
	}
	return 0, nil
}
func (m *mockRepository) CreateTransaction(ctx context.Context, ptx *PocketTransaction) (*PocketTransaction, error) {
	if m.createTransactionFn != nil {
		return m.createTransactionFn(ctx, ptx)
	}
	ptx.ID = "ptx-1"
	return ptx, nil
}
func (m *mockRepository) GetTransactionByID(ctx context.Context, id string) (*PocketTransaction, error) {
	if m.getTransactionByIDFn != nil {
		return m.getTransactionByIDFn(ctx, id)
	}
	return nil, ErrTransactionNotFound
}
func (m *mockRepository) UpdateTransaction(ctx context.Context, id string, input *EditTransactionInput) (*PocketTransaction, error) {
	if m.updateTransactionFn != nil {
		return m.updateTransactionFn(ctx, id, input)
	}
	return &PocketTransaction{ID: id}, nil
}
func (m *mockRepository) DeleteTransaction(ctx context.Context, id string) error {
	if m.deleteTransactionFn != nil {
		return m.deleteTransactionFn(ctx, id)
	}
	return nil
}
func (m *mockRepository) ListTransactions(ctx context.Context, pid string) ([]*PocketTransaction, error) {
	if m.listTransactionsFn != nil {
		return m.listTransactionsFn(ctx, pid)
	}
	return nil, nil
}
func (m *mockRepository) GetTransactionByLinkedMovementID(ctx context.Context, mid string) (*PocketTransaction, error) {
	if m.getTransactionByLinkedMovIDFn != nil {
		return m.getTransactionByLinkedMovIDFn(ctx, mid)
	}
	return nil, nil
}
func (m *mockRepository) BeginTx(ctx context.Context) (any, error) {
	if m.beginTxFn != nil {
		return m.beginTxFn(ctx)
	}
	return "fake-tx", nil
}
func (m *mockRepository) CommitTx(ctx context.Context, tx any) error {
	if m.commitTxFn != nil {
		return m.commitTxFn(ctx, tx)
	}
	return nil
}
func (m *mockRepository) RollbackTx(ctx context.Context, tx any) error {
	if m.rollbackTxFn != nil {
		return m.rollbackTxFn(ctx, tx)
	}
	return nil
}
func (m *mockRepository) CreateTransactionInTx(ctx context.Context, tx any, ptx *PocketTransaction) (*PocketTransaction, error) {
	if m.createTransactionInTxFn != nil {
		return m.createTransactionInTxFn(ctx, tx, ptx)
	}
	ptx.ID = "ptx-1"
	return ptx, nil
}

// mockMovementsRepo implements movements.Repository
type mockMovementsRepo struct {
	createFn func(ctx context.Context, input *movements.CreateMovementInput, householdID string) (*movements.Movement, error)
	getByIDFn func(ctx context.Context, id string) (*movements.Movement, error)
	updateFn func(ctx context.Context, id string, input *movements.UpdateMovementInput) (*movements.Movement, error)
	deleteFn func(ctx context.Context, id string) error
}

func (m *mockMovementsRepo) Create(ctx context.Context, input *movements.CreateMovementInput, hid string) (*movements.Movement, error) {
	if m.createFn != nil {
		return m.createFn(ctx, input, hid)
	}
	return &movements.Movement{ID: "mov-1", HouseholdID: hid, Type: movements.TypeHousehold}, nil
}
func (m *mockMovementsRepo) GetByID(ctx context.Context, id string) (*movements.Movement, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &movements.Movement{ID: id}, nil
}
func (m *mockMovementsRepo) GetCategoryIDByName(ctx context.Context, hid, name string) (string, error) {
	return "", nil
}
func (m *mockMovementsRepo) ListByHousehold(ctx context.Context, hid string, f *movements.ListMovementsFilters) ([]*movements.Movement, error) {
	return nil, nil
}
func (m *mockMovementsRepo) ListMovementsByContactIDs(ctx context.Context, ids []string, month *string) ([]*movements.Movement, error) {
	return nil, nil
}
func (m *mockMovementsRepo) GetTotals(ctx context.Context, hid string, f *movements.ListMovementsFilters) (*movements.MovementTotals, error) {
	return nil, nil
}
func (m *mockMovementsRepo) Update(ctx context.Context, id string, input *movements.UpdateMovementInput) (*movements.Movement, error) {
	if m.updateFn != nil {
		return m.updateFn(ctx, id, input)
	}
	return &movements.Movement{ID: id}, nil
}
func (m *mockMovementsRepo) Delete(ctx context.Context, id string) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id)
	}
	return nil
}

// mockAccountsRepo implements accounts.Repository (partial)
type mockAccountsRepo struct {
	getByIDFn func(ctx context.Context, id string) (*accounts.Account, error)
}

func (m *mockAccountsRepo) GetByID(ctx context.Context, id string) (*accounts.Account, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &accounts.Account{ID: id, HouseholdID: "household-1"}, nil
}
func (m *mockAccountsRepo) Create(ctx context.Context, a *accounts.Account) (*accounts.Account, error) {
	return a, nil
}
func (m *mockAccountsRepo) Update(ctx context.Context, a *accounts.Account) (*accounts.Account, error) {
	return a, nil
}
func (m *mockAccountsRepo) Delete(ctx context.Context, id string) error { return nil }
func (m *mockAccountsRepo) ListByHousehold(ctx context.Context, hid string) ([]*accounts.Account, error) {
	return nil, nil
}
func (m *mockAccountsRepo) GetBalance(ctx context.Context, id string) (float64, error) {
	return 0, nil
}
func (m *mockAccountsRepo) FindByName(ctx context.Context, householdID, name string) (*accounts.Account, error) {
	return nil, nil
}

// mockHouseholdRepo implements households.HouseholdRepository (partial)
type mockHouseholdRepo struct {
	isUserMemberFn func(ctx context.Context, hid, uid string) (bool, error)
}

func (m *mockHouseholdRepo) IsUserMember(ctx context.Context, hid, uid string) (bool, error) {
	if m.isUserMemberFn != nil {
		return m.isUserMemberFn(ctx, hid, uid)
	}
	return true, nil
}
func (m *mockHouseholdRepo) Create(ctx context.Context, name, createdBy string) (*households.Household, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) GetByID(ctx context.Context, id string) (*households.Household, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) Update(ctx context.Context, id, name string) (*households.Household, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) Delete(ctx context.Context, id string) error { return nil }
func (m *mockHouseholdRepo) ListByUser(ctx context.Context, uid string) ([]*households.Household, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) AddMember(ctx context.Context, hid, uid string, role households.HouseholdRole) (*households.HouseholdMember, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) RemoveMember(ctx context.Context, hid, uid string) error { return nil }
func (m *mockHouseholdRepo) UpdateMemberRole(ctx context.Context, hid, uid string, role households.HouseholdRole) (*households.HouseholdMember, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) GetMembers(ctx context.Context, hid string) ([]*households.HouseholdMember, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) GetMemberByUserID(ctx context.Context, hid, uid string) (*households.HouseholdMember, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) CountOwners(ctx context.Context, hid string) (int, error) { return 1, nil }
func (m *mockHouseholdRepo) CreateContact(ctx context.Context, c *households.Contact) (*households.Contact, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) GetContact(ctx context.Context, id string) (*households.Contact, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) UpdateContact(ctx context.Context, c *households.Contact, isActive *bool) (*households.Contact, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) DeleteContact(ctx context.Context, id string) error { return nil }
func (m *mockHouseholdRepo) ListContacts(ctx context.Context, hid string) ([]*households.Contact, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) FindContactByEmail(ctx context.Context, hid, email string) (*households.Contact, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) FindLinkedContactsByHousehold(ctx context.Context, hid string) ([]households.LinkedContact, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) CreateInvitation(ctx context.Context, hid, email, token, invitedBy string) (*households.HouseholdInvitation, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) GetInvitationByToken(ctx context.Context, token string) (*households.HouseholdInvitation, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) AcceptInvitation(ctx context.Context, id string) error { return nil }
func (m *mockHouseholdRepo) ListPendingInvitations(ctx context.Context, hid string) ([]*households.HouseholdInvitation, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) GetUserHouseholdID(ctx context.Context, uid string) (string, error) {
	return "household-1", nil
}
func (m *mockHouseholdRepo) ListPendingLinkRequests(ctx context.Context, uid string) ([]households.LinkRequest, error) {
	return nil, nil
}
func (m *mockHouseholdRepo) CountPendingLinkRequests(ctx context.Context, uid string) (int, error) {
	return 0, nil
}
func (m *mockHouseholdRepo) UpdateContactLinkStatus(ctx context.Context, cid, status string) error {
	return nil
}
func (m *mockHouseholdRepo) UpdateContactLinkedUser(ctx context.Context, cid, uid, reqBy, status string) error {
	return nil
}
func (m *mockHouseholdRepo) UnlinkContact(ctx context.Context, cid string) error { return nil }
func (m *mockHouseholdRepo) SetWasUnlinkedAt(ctx context.Context, cid string) error { return nil }
func (m *mockHouseholdRepo) DismissUnlinkBanner(ctx context.Context, cid string) error { return nil }
func (m *mockHouseholdRepo) FindContactByLinkedUserID(ctx context.Context, hid, uid string) (*households.Contact, error) {
	return nil, nil
}

// mockAuditService
type mockAuditService struct{}

// mockCategoryGroupRepo implements CategoryGroupRepo
type mockCategoryGroupRepo struct {
	findOrCreateByNameFn func(ctx context.Context, householdID, name, icon string) (string, error)
}

func (m *mockCategoryGroupRepo) FindOrCreateByName(ctx context.Context, householdID, name, icon string) (string, error) {
	if m.findOrCreateByNameFn != nil {
		return m.findOrCreateByNameFn(ctx, householdID, name, icon)
	}
	return "catgroup-ahorros", nil
}

// mockCategoryRepo implements CategoryRepo
type mockCategoryRepo struct {
	findOrCreateByNameFn    func(ctx context.Context, householdID, groupID, name string) (string, bool, error)
	renameByGroupAndNameFn  func(ctx context.Context, householdID, groupID, oldName, newName string) error
}

func (m *mockCategoryRepo) FindOrCreateByName(ctx context.Context, householdID, groupID, name string) (string, bool, error) {
	if m.findOrCreateByNameFn != nil {
		return m.findOrCreateByNameFn(ctx, householdID, groupID, name)
	}
	return "cat-auto", false, nil
}

func (m *mockCategoryRepo) RenameByGroupAndName(ctx context.Context, householdID, groupID, oldName, newName string) error {
	if m.renameByGroupAndNameFn != nil {
		return m.renameByGroupAndNameFn(ctx, householdID, groupID, oldName, newName)
	}
	return nil
}

func (m *mockAuditService) Log(ctx context.Context, input *audit.LogInput) error          { return nil }
func (m *mockAuditService) LogAsync(ctx context.Context, input *audit.LogInput)            {}
func (m *mockAuditService) LogFromRequest(r *http.Request, input *audit.LogInput) error    { return nil }
func (m *mockAuditService) Query(ctx context.Context, f *audit.ListFilters) ([]*audit.AuditLog, int, error) {
	return nil, 0, nil
}
func (m *mockAuditService) Cleanup(ctx context.Context, days int) (int64, error) { return 0, nil }

// ============================================================
// Helpers
// ============================================================

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func f64(v float64) *float64 { return &v }
func strPtr(v string) *string { return &v }

func defaultPocket() *Pocket {
	bal := 0.0
	return &Pocket{
		ID:          "pocket-1",
		HouseholdID: "household-1",
		OwnerID:     "user-1",
		OwnerName:   "Test User",
		Name:        "Vacaciones",
		Icon:        "🏖️",
		GoalAmount:  f64(500000),
		IsActive:    true,
		Balance:     &bal,
	}
}

func defaultService(repo *mockRepository, movRepo *mockMovementsRepo, accRepo *mockAccountsRepo, hhRepo *mockHouseholdRepo) *Service {
	return NewService(repo, movRepo, accRepo, hhRepo, &mockCategoryGroupRepo{}, &mockCategoryRepo{}, &mockAuditService{}, newTestLogger())
}

// ============================================================
// Input Validation Tests
// ============================================================

func TestCreatePocketInput_Validate(t *testing.T) {
	tests := []struct {
		name    string
		input   CreatePocketInput
		wantErr string
	}{
		{"valid", CreatePocketInput{Name: "Test", HouseholdID: "h1", OwnerID: "u1"}, ""},
		{"empty name", CreatePocketInput{Name: "", HouseholdID: "h1", OwnerID: "u1"}, "pocket name is required"},
		{"name too long", CreatePocketInput{Name: strings.Repeat("a", 101), HouseholdID: "h1", OwnerID: "u1"}, "100 characters"},
		{"no household", CreatePocketInput{Name: "Test", HouseholdID: "", OwnerID: "u1"}, "household ID is required"},
		{"no owner", CreatePocketInput{Name: "Test", HouseholdID: "h1", OwnerID: ""}, "owner ID is required"},
		{"negative goal", CreatePocketInput{Name: "Test", HouseholdID: "h1", OwnerID: "u1", GoalAmount: f64(-100)}, "goal amount must be positive"},
		{"zero goal", CreatePocketInput{Name: "Test", HouseholdID: "h1", OwnerID: "u1", GoalAmount: f64(0)}, "goal amount must be positive"},
		{"defaults icon", CreatePocketInput{Name: "Test", HouseholdID: "h1", OwnerID: "u1", Icon: ""}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.input.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			} else {
				if err == nil {
					t.Errorf("expected error containing %q", tt.wantErr)
				} else if !strings.Contains(err.Error(), tt.wantErr) {
					t.Errorf("expected error containing %q, got %q", tt.wantErr, err.Error())
				}
			}
		})
	}
}

func TestDepositInput_Validate(t *testing.T) {
	validDate := time.Now()
	tests := []struct {
		name    string
		input   DepositInput
		wantErr string
	}{
		{"valid", DepositInput{PocketID: "p1", Amount: 100, SourceAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, ""},
		{"no pocket", DepositInput{PocketID: "", Amount: 100, SourceAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, "pocket ID is required"},
		{"zero amount", DepositInput{PocketID: "p1", Amount: 0, SourceAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, "amount must be positive"},
		{"negative amount", DepositInput{PocketID: "p1", Amount: -50, SourceAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, "amount must be positive"},
		{"no account", DepositInput{PocketID: "p1", Amount: 100, SourceAccountID: "", TransactionDate: validDate, CreatedBy: "u1"}, "source account is required"},
		{"no date", DepositInput{PocketID: "p1", Amount: 100, SourceAccountID: "a1", CreatedBy: "u1"}, "transaction date is required"},
		{"no created_by", DepositInput{PocketID: "p1", Amount: 100, SourceAccountID: "a1", TransactionDate: validDate}, "created_by is required"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.input.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("expected error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestWithdrawInput_Validate(t *testing.T) {
	validDate := time.Now()
	tests := []struct {
		name    string
		input   WithdrawInput
		wantErr string
	}{
		{"valid", WithdrawInput{PocketID: "p1", Amount: 100, DestinationAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, ""},
		{"no pocket", WithdrawInput{PocketID: "", Amount: 100, DestinationAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, "pocket ID is required"},
		{"zero amount", WithdrawInput{PocketID: "p1", Amount: 0, DestinationAccountID: "a1", TransactionDate: validDate, CreatedBy: "u1"}, "amount must be positive"},
		{"no dest account", WithdrawInput{PocketID: "p1", Amount: 100, DestinationAccountID: "", TransactionDate: validDate, CreatedBy: "u1"}, "destination account is required"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.input.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("expected error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

// ============================================================
// Service.Create Tests
// ============================================================

func TestCreate(t *testing.T) {
	t.Run("valid create", func(t *testing.T) {
		repo := &mockRepository{}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		pocket, err := svc.Create(context.Background(), &CreatePocketInput{
			HouseholdID: "household-1",
			OwnerID:     "user-1",
			Name:        "Vacaciones",
			Icon:        "🏖️",
			GoalAmount:  f64(500000),
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if pocket == nil {
			t.Fatal("expected pocket, got nil")
		}
	})

	t.Run("name already exists", func(t *testing.T) {
		repo := &mockRepository{
			findByNameFn: func(_ context.Context, _, _ string) (*Pocket, error) {
				return defaultPocket(), nil // name found
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		_, err := svc.Create(context.Background(), &CreatePocketInput{
			HouseholdID: "household-1", OwnerID: "user-1", Name: "Vacaciones",
		})
		if !errors.Is(err, ErrPocketNameExists) {
			t.Errorf("expected ErrPocketNameExists, got %v", err)
		}
	})

	t.Run("max 20 pockets reached", func(t *testing.T) {
		repo := &mockRepository{
			countByHouseholdFn: func(_ context.Context, _ string) (int, error) { return 20, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		_, err := svc.Create(context.Background(), &CreatePocketInput{
			HouseholdID: "household-1", OwnerID: "user-1", Name: "New Pocket",
		})
		if !errors.Is(err, ErrMaxPocketsReached) {
			t.Errorf("expected ErrMaxPocketsReached, got %v", err)
		}
	})

	t.Run("owner not household member", func(t *testing.T) {
		hhRepo := &mockHouseholdRepo{
			isUserMemberFn: func(_ context.Context, _, _ string) (bool, error) { return false, nil },
		}
		svc := defaultService(&mockRepository{}, &mockMovementsRepo{}, &mockAccountsRepo{}, hhRepo)

		_, err := svc.Create(context.Background(), &CreatePocketInput{
			HouseholdID: "household-1", OwnerID: "user-outsider", Name: "Test",
		})
		if !errors.Is(err, ErrNotAuthorized) {
			t.Errorf("expected ErrNotAuthorized, got %v", err)
		}
	})
}

// ============================================================
// Service.GetByID Tests
// ============================================================

func TestGetByID(t *testing.T) {
	t.Run("valid get", func(t *testing.T) {
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) {
				return defaultPocket(), nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		pocket, err := svc.GetByID(context.Background(), "pocket-1", "household-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if pocket.ID != "pocket-1" {
			t.Errorf("expected pocket-1, got %s", pocket.ID)
		}
	})

	t.Run("wrong household", func(t *testing.T) {
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) {
				return defaultPocket(), nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		_, err := svc.GetByID(context.Background(), "pocket-1", "other-household")
		if !errors.Is(err, ErrNotAuthorized) {
			t.Errorf("expected ErrNotAuthorized, got %v", err)
		}
	})
}

// ============================================================
// Service.Update Tests
// ============================================================

func TestUpdate(t *testing.T) {
	t.Run("valid update", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			updateFn:  func(_ context.Context, pocket *Pocket) (*Pocket, error) { return pocket, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		newName := "Updated Name"
		result, err := svc.Update(context.Background(), "user-1", "household-1", &UpdatePocketInput{
			ID: "pocket-1", Name: &newName,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Name != "Updated Name" {
			t.Errorf("expected Updated Name, got %s", result.Name)
		}
	})

	t.Run("duplicate name on update", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			findByNameFn: func(_ context.Context, _, name string) (*Pocket, error) {
				if name == "Existing" {
					return &Pocket{ID: "pocket-other"}, nil
				}
				return nil, nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		dupName := "Existing"
		_, err := svc.Update(context.Background(), "user-1", "household-1", &UpdatePocketInput{
			ID: "pocket-1", Name: &dupName,
		})
		if !errors.Is(err, ErrPocketNameExists) {
			t.Errorf("expected ErrPocketNameExists, got %v", err)
		}
	})
}

// ============================================================
// Service.Deactivate Tests
// ============================================================

func TestDeactivate(t *testing.T) {
	t.Run("empty pocket no force", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn:  func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getBalanceFn: func(_ context.Context, _ string) (float64, error) { return 0, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.Deactivate(context.Background(), "pocket-1", "user-1", "household-1", false)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
	})

	t.Run("pocket with balance no force → ErrPocketHasBalance", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn:  func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getBalanceFn: func(_ context.Context, _ string) (float64, error) { return 50000, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.Deactivate(context.Background(), "pocket-1", "user-1", "household-1", false)
		if !errors.Is(err, ErrPocketHasBalance) {
			t.Errorf("expected ErrPocketHasBalance, got %v", err)
		}
	})

	t.Run("pocket with balance force=true → success", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.Deactivate(context.Background(), "pocket-1", "user-1", "household-1", true)
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
	})

}

// ============================================================
// Service.Deposit Tests
// ============================================================

func TestDeposit(t *testing.T) {
	validDate := time.Now()

	t.Run("valid deposit creates linked movement", func(t *testing.T) {
		p := defaultPocket()
		var capturedMovInput *movements.CreateMovementInput
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
		}
		movRepo := &mockMovementsRepo{
			createFn: func(_ context.Context, input *movements.CreateMovementInput, hid string) (*movements.Movement, error) {
				capturedMovInput = input
				return &movements.Movement{ID: "mov-1", HouseholdID: hid, Type: movements.TypeHousehold}, nil
			},
		}
		svc := defaultService(repo, movRepo, &mockAccountsRepo{}, &mockHouseholdRepo{})

		result, err := svc.Deposit(context.Background(), &DepositInput{
			PocketID: "pocket-1", Amount: 100000, Description: "First deposit",
			TransactionDate: validDate, SourceAccountID: "acc-1", CreatedBy: "user-1",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("expected result, got nil")
		}

		// Verify linked movement properties per design
		if capturedMovInput == nil {
			t.Fatal("expected movement to be created")
		}
		if capturedMovInput.Type != movements.TypeHousehold {
			t.Errorf("linked movement type: expected HOUSEHOLD, got %s", capturedMovInput.Type)
		}
		if capturedMovInput.PaymentMethodID != nil {
			t.Error("linked movement should have nil PaymentMethodID to avoid double-counting")
		}
		if capturedMovInput.SourcePocketID == nil || *capturedMovInput.SourcePocketID != "pocket-1" {
			t.Error("linked movement should have SourcePocketID set to pocket ID")
		}
		expectedDesc := "Depósito a Vacaciones: First deposit"
		if capturedMovInput.Description != expectedDesc {
			t.Errorf("description: expected %q, got %q", expectedDesc, capturedMovInput.Description)
		}
		if capturedMovInput.CategoryID == nil || *capturedMovInput.CategoryID != "cat-auto" {
			t.Error("linked movement should have the auto-resolved category_id")
		}
		if capturedMovInput.PayerUserID == nil || *capturedMovInput.PayerUserID != "user-1" {
			t.Error("linked movement payer should be the logged-in user")
		}
	})

	t.Run("pocket not active → ErrPocketNotActive", func(t *testing.T) {
		p := defaultPocket()
		p.IsActive = false
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		_, err := svc.Deposit(context.Background(), &DepositInput{
			PocketID: "pocket-1", Amount: 100, Description: "x",
			TransactionDate: validDate, SourceAccountID: "a1", CreatedBy: "user-1",
		})
		if !errors.Is(err, ErrPocketNotActive) {
			t.Errorf("expected ErrPocketNotActive, got %v", err)
		}
	})

	t.Run("account from different household → ErrNotAuthorized", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
		}
		accRepo := &mockAccountsRepo{
			getByIDFn: func(_ context.Context, _ string) (*accounts.Account, error) {
				return &accounts.Account{ID: "acc-1", HouseholdID: "OTHER-household"}, nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, accRepo, &mockHouseholdRepo{})

		_, err := svc.Deposit(context.Background(), &DepositInput{
			PocketID: "pocket-1", Amount: 100, Description: "x",
			TransactionDate: validDate, SourceAccountID: "acc-1", CreatedBy: "user-1",
		})
		if !errors.Is(err, ErrNotAuthorized) {
			t.Errorf("expected ErrNotAuthorized, got %v", err)
		}
	})
}

// ============================================================
// Service.Withdraw Tests
// ============================================================

func TestWithdraw(t *testing.T) {
	validDate := time.Now()

	t.Run("valid withdrawal", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn:             func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getBalanceForUpdateFn: func(_ context.Context, _ any, _ string) (float64, error) { return 100000, nil },
			getTransactionByIDFn:  func(_ context.Context, id string) (*PocketTransaction, error) {
				return &PocketTransaction{ID: id, Type: TransactionTypeWithdrawal}, nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		result, err := svc.Withdraw(context.Background(), &WithdrawInput{
			PocketID: "pocket-1", Amount: 50000, Description: "Partial withdrawal",
			TransactionDate: validDate, DestinationAccountID: "acc-1", CreatedBy: "user-1",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("expected result, got nil")
		}
	})

	t.Run("overdraft prevention", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn:             func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getBalanceForUpdateFn: func(_ context.Context, _ any, _ string) (float64, error) { return 50000, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		_, err := svc.Withdraw(context.Background(), &WithdrawInput{
			PocketID: "pocket-1", Amount: 100000, Description: "Overdraft",
			TransactionDate: validDate, DestinationAccountID: "acc-1", CreatedBy: "user-1",
		})
		if !errors.Is(err, ErrInsufficientBalance) {
			t.Errorf("expected ErrInsufficientBalance, got %v", err)
		}
	})

}

// ============================================================
// Service.EditTransaction Tests
// ============================================================

func TestEditTransaction(t *testing.T) {
	t.Run("edit deposit propagates amount to linked movement", func(t *testing.T) {
		p := defaultPocket()
		linkedMovID := "mov-1"
		existingTx := &PocketTransaction{
			ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeDeposit, Amount: 100000,
			LinkedMovementID: &linkedMovID, CreatedBy: "user-1",
		}

		var capturedMovUpdate *movements.UpdateMovementInput
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
			updateTransactionFn: func(_ context.Context, id string, _ *EditTransactionInput) (*PocketTransaction, error) {
				return &PocketTransaction{ID: id, Amount: 150000, LinkedMovementID: &linkedMovID}, nil
			},
		}
		movRepo := &mockMovementsRepo{
			updateFn: func(_ context.Context, id string, input *movements.UpdateMovementInput) (*movements.Movement, error) {
				capturedMovUpdate = input
				return &movements.Movement{ID: id}, nil
			},
		}
		svc := defaultService(repo, movRepo, &mockAccountsRepo{}, &mockHouseholdRepo{})

		newAmount := 150000.0
		_, err := svc.EditTransaction(context.Background(), "user-1", "household-1", &EditTransactionInput{
			ID: "ptx-1", Amount: &newAmount,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if capturedMovUpdate == nil {
			t.Fatal("expected linked movement to be updated")
		}
		if capturedMovUpdate.Amount == nil || *capturedMovUpdate.Amount != 150000 {
			t.Errorf("expected movement amount 150000, got %v", capturedMovUpdate.Amount)
		}
	})

	t.Run("edit deposit description propagates with format", func(t *testing.T) {
		p := defaultPocket()
		linkedMovID := "mov-1"
		existingTx := &PocketTransaction{
			ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeDeposit, Amount: 100000,
			LinkedMovementID: &linkedMovID, CreatedBy: "user-1",
		}

		var capturedMovUpdate *movements.UpdateMovementInput
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
			updateTransactionFn: func(_ context.Context, id string, _ *EditTransactionInput) (*PocketTransaction, error) {
				return &PocketTransaction{ID: id, LinkedMovementID: &linkedMovID}, nil
			},
		}
		movRepo := &mockMovementsRepo{
			updateFn: func(_ context.Context, _ string, input *movements.UpdateMovementInput) (*movements.Movement, error) {
				capturedMovUpdate = input
				return &movements.Movement{}, nil
			},
		}
		svc := defaultService(repo, movRepo, &mockAccountsRepo{}, &mockHouseholdRepo{})

		newDesc := "Updated description"
		_, err := svc.EditTransaction(context.Background(), "user-1", "household-1", &EditTransactionInput{
			ID: "ptx-1", Description: &newDesc,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		expectedDesc := "Depósito a Vacaciones: Updated description"
		if capturedMovUpdate.Description == nil || *capturedMovUpdate.Description != expectedDesc {
			t.Errorf("expected description %q, got %v", expectedDesc, capturedMovUpdate.Description)
		}
	})

	t.Run("edit withdrawal amount up → check balance", func(t *testing.T) {
		p := defaultPocket()
		existingTx := &PocketTransaction{
			ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeWithdrawal, Amount: 30000, CreatedBy: "user-1",
		}
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
			getBalanceFn:         func(_ context.Context, _ string) (float64, error) { return 10000, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		// Trying to increase withdrawal from 30k to 60k, but only 10k extra available
		newAmount := 60000.0
		_, err := svc.EditTransaction(context.Background(), "user-1", "household-1", &EditTransactionInput{
			ID: "ptx-1", Amount: &newAmount,
		})
		if !errors.Is(err, ErrInsufficientBalance) {
			t.Errorf("expected ErrInsufficientBalance, got %v", err)
		}
	})

	// ==========================================================
	// BUG: EditTransaction for DEPOSIT does NOT check that reducing
	// the amount won't cause negative pocket balance.
	// Design doc Edge Case #14: "Deposits: check resulting balance ≥ 0"
	// ==========================================================
	t.Run("edit deposit reducing amount checks balance", func(t *testing.T) {
		// Scenario: deposit 100k, withdrawal 30k → balance = 70k
		// Edit deposit from 100k → 20k → balance would be 20k - 30k = -10k
		// This MUST be rejected.
		p := defaultPocket()
		linkedMovID := "mov-1"
		existingTx := &PocketTransaction{
			ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeDeposit, Amount: 100000,
			LinkedMovementID: &linkedMovID, CreatedBy: "user-1",
		}
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
			// Current balance is 70k (100k deposit - 30k withdrawal)
			getBalanceFn: func(_ context.Context, _ string) (float64, error) { return 70000, nil },
		}
		movRepo := &mockMovementsRepo{}
		svc := defaultService(repo, movRepo, &mockAccountsRepo{}, &mockHouseholdRepo{})

		// Reducing deposit from 100k to 20k
		// New balance would be: 70000 - (100000 - 20000) = 70000 - 80000 = -10000
		// This SHOULD be rejected.
		newAmount := 20000.0
		_, err := svc.EditTransaction(context.Background(), "user-1", "household-1", &EditTransactionInput{
			ID: "ptx-1", Amount: &newAmount,
		})

		if !errors.Is(err, ErrInsufficientBalance) {
			t.Errorf("expected ErrInsufficientBalance, got: %v", err)
		}
	})
}

// ============================================================
// Service.DeleteTransaction Tests
// ============================================================

func TestDeleteTransaction(t *testing.T) {
	t.Run("delete withdrawal always allowed", func(t *testing.T) {
		p := defaultPocket()
		existingTx := &PocketTransaction{
			ID: "ptx-wd", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeWithdrawal, Amount: 30000, CreatedBy: "user-1",
		}
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransaction(context.Background(), "ptx-wd", "user-1", "household-1")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
	})

	t.Run("delete deposit cascades to linked movement", func(t *testing.T) {
		p := defaultPocket()
		linkedMovID := "mov-1"
		existingTx := &PocketTransaction{
			ID: "ptx-dep", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeDeposit, Amount: 100000,
			LinkedMovementID: &linkedMovID, CreatedBy: "user-1",
		}
		movDeleted := false
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
			getBalanceFn:         func(_ context.Context, _ string) (float64, error) { return 100000, nil },
		}
		movRepo := &mockMovementsRepo{
			deleteFn: func(_ context.Context, id string) error {
				if id == "mov-1" {
					movDeleted = true
				}
				return nil
			},
		}
		svc := defaultService(repo, movRepo, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransaction(context.Background(), "ptx-dep", "user-1", "household-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !movDeleted {
			t.Error("expected linked movement to be cascade deleted")
		}
	})

	t.Run("delete deposit that would cause overdraft → ErrDeleteWouldOverdraft", func(t *testing.T) {
		p := defaultPocket()
		linkedMovID := "mov-1"
		existingTx := &PocketTransaction{
			ID: "ptx-dep", PocketID: "pocket-1", HouseholdID: "household-1",
			Type: TransactionTypeDeposit, Amount: 100000,
			LinkedMovementID: &linkedMovID, CreatedBy: "user-1",
		}
		repo := &mockRepository{
			getByIDFn:            func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getTransactionByIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) { return existingTx, nil },
			// Balance is 70k = deposit 100k - withdrawal 30k
			// Deleting the 100k deposit would make balance -30k
			getBalanceFn: func(_ context.Context, _ string) (float64, error) { return 70000, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransaction(context.Background(), "ptx-dep", "user-1", "household-1")
		if !errors.Is(err, ErrDeleteWouldOverdraft) {
			t.Errorf("expected ErrDeleteWouldOverdraft, got %v", err)
		}
	})

}

// ============================================================
// Service.DeleteTransactionByMovementID Tests
// ============================================================

func TestDeleteTransactionByMovementID(t *testing.T) {
	t.Run("no linked transaction → no-op", func(t *testing.T) {
		repo := &mockRepository{
			getTransactionByLinkedMovIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) {
				return nil, nil // not found
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransactionByMovementID(context.Background(), "mov-xxx", "household-1")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
	})

	t.Run("found linked deposit → deletes pocket transaction", func(t *testing.T) {
		p := defaultPocket()
		ptxDeleted := false
		repo := &mockRepository{
			getTransactionByLinkedMovIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) {
				return &PocketTransaction{
					ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
					Type: TransactionTypeDeposit, Amount: 100000, CreatedBy: "user-1",
				}, nil
			},
			getByIDFn:    func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			getBalanceFn: func(_ context.Context, _ string) (float64, error) { return 100000, nil },
			deleteTransactionFn: func(_ context.Context, id string) error {
				ptxDeleted = true
				return nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransactionByMovementID(context.Background(), "mov-1", "household-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !ptxDeleted {
			t.Error("expected pocket transaction to be deleted")
		}
	})

	t.Run("would cause overdraft → ErrDeleteWouldOverdraft", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getTransactionByLinkedMovIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) {
				return &PocketTransaction{
					ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
					Type: TransactionTypeDeposit, Amount: 100000, CreatedBy: "user-1",
				}, nil
			},
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			// Balance 70k, deleting 100k deposit would be -30k
			getBalanceFn: func(_ context.Context, _ string) (float64, error) { return 70000, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransactionByMovementID(context.Background(), "mov-1", "household-1")
		if !errors.Is(err, ErrDeleteWouldOverdraft) {
			t.Errorf("expected ErrDeleteWouldOverdraft, got %v", err)
		}
	})

	t.Run("wrong household → ErrNotAuthorized", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getTransactionByLinkedMovIDFn: func(_ context.Context, _ string) (*PocketTransaction, error) {
				return &PocketTransaction{
					ID: "ptx-1", PocketID: "pocket-1", HouseholdID: "household-1",
					Type: TransactionTypeDeposit, Amount: 100000, CreatedBy: "user-1",
				}, nil
			},
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		err := svc.DeleteTransactionByMovementID(context.Background(), "mov-1", "OTHER-household")
		if !errors.Is(err, ErrNotAuthorized) {
			t.Errorf("expected ErrNotAuthorized, got %v", err)
		}
	})
}

// ============================================================
// Service.GetSummary Tests
// ============================================================

func TestGetSummary(t *testing.T) {
	t.Run("empty pockets", func(t *testing.T) {
		repo := &mockRepository{
			listActiveByHouseholdFn: func(_ context.Context, _ string) ([]*Pocket, error) {
				return []*Pocket{}, nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		summary, err := svc.GetSummary(context.Background(), "household-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if summary.TotalBalance != 0 {
			t.Errorf("expected 0 total_balance, got %f", summary.TotalBalance)
		}
		if summary.PocketCount != 0 {
			t.Errorf("expected 0 pocket_count, got %d", summary.PocketCount)
		}
		if summary.TotalGoal != nil {
			t.Errorf("expected nil total_goal, got %v", summary.TotalGoal)
		}
	})

	t.Run("multiple pockets with and without goals", func(t *testing.T) {
		bal1 := 50000.0
		bal2 := 30000.0
		goal1 := 100000.0
		repo := &mockRepository{
			listActiveByHouseholdFn: func(_ context.Context, _ string) ([]*Pocket, error) {
				return []*Pocket{
					{ID: "p1", Balance: &bal1, GoalAmount: &goal1},
					{ID: "p2", Balance: &bal2, GoalAmount: nil},
				}, nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		summary, err := svc.GetSummary(context.Background(), "household-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if summary.TotalBalance != 80000 {
			t.Errorf("expected 80000 total, got %f", summary.TotalBalance)
		}
		if summary.PocketCount != 2 {
			t.Errorf("expected 2 pockets, got %d", summary.PocketCount)
		}
		if summary.TotalGoal == nil || *summary.TotalGoal != 100000 {
			t.Errorf("expected total_goal 100000, got %v", summary.TotalGoal)
		}
	})
}

// ============================================================
// Service.ListTransactions Tests
// ============================================================

func TestListTransactions(t *testing.T) {
	t.Run("valid list", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
			listTransactionsFn: func(_ context.Context, _ string) ([]*PocketTransaction, error) {
				return []*PocketTransaction{{ID: "ptx-1"}}, nil
			},
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		txs, err := svc.ListTransactions(context.Background(), "pocket-1", "household-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(txs) != 1 {
			t.Errorf("expected 1 transaction, got %d", len(txs))
		}
	})

	t.Run("wrong household", func(t *testing.T) {
		p := defaultPocket()
		repo := &mockRepository{
			getByIDFn: func(_ context.Context, _ string) (*Pocket, error) { return p, nil },
		}
		svc := defaultService(repo, &mockMovementsRepo{}, &mockAccountsRepo{}, &mockHouseholdRepo{})

		_, err := svc.ListTransactions(context.Background(), "pocket-1", "other-household")
		if !errors.Is(err, ErrNotAuthorized) {
			t.Errorf("expected ErrNotAuthorized, got %v", err)
		}
	})
}
