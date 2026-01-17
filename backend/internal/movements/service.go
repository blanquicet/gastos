package movements

import (
	"context"
	"errors"
	"log/slog"

	"github.com/blanquicet/gastos/backend/internal/accounts"
	"github.com/blanquicet/gastos/backend/internal/audit"
	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/n8nclient"
	"github.com/blanquicet/gastos/backend/internal/paymentmethods"
)

// service implements Service interface
type service struct {
	repo              Repository
	householdsRepo    households.HouseholdRepository
	paymentMethodRepo paymentmethods.Repository
	accountsRepo      accounts.Repository
	n8nClient         *n8nclient.Client
	auditService      audit.Service
	logger            *slog.Logger
}

// NewService creates a new movements service
func NewService(
	repo Repository,
	householdsRepo households.HouseholdRepository,
	paymentMethodRepo paymentmethods.Repository,
	accountsRepo accounts.Repository,
	n8nClient *n8nclient.Client,
	auditService audit.Service,
	logger *slog.Logger,
) Service {
	return &service{
		repo:              repo,
		householdsRepo:    householdsRepo,
		paymentMethodRepo: paymentMethodRepo,
		accountsRepo:      accountsRepo,
		n8nClient:         n8nClient,
		auditService:      auditService,
		logger:            logger,
	}
}

// Create creates a new movement
func (s *service) Create(ctx context.Context, userID string, input *CreateMovementInput) (*Movement, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Verify payer belongs to household (if user) or is a contact of household
	if input.PayerUserID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *input.PayerUserID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, ErrNotAuthorized
		}
	}
	// Note: We don't validate contact ownership here - the FK constraint will handle it

	// Verify counterparty belongs to household (if user) or is a contact of household
	if input.CounterpartyUserID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *input.CounterpartyUserID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, ErrNotAuthorized
		}
	}

	// Verify payment method belongs to household (if provided)
	if input.PaymentMethodID != nil {
		pm, err := s.paymentMethodRepo.GetByID(ctx, *input.PaymentMethodID)
		if err != nil {
			return nil, err
		}
		if pm.HouseholdID != householdID {
			return nil, ErrNotAuthorized
		}
	}

	// Verify receiver account for DEBT_PAYMENT with household member receiver
	if input.Type == TypeDebtPayment && input.CounterpartyUserID != nil {
		// Receiver account is required when counterparty is a household member
		if input.ReceiverAccountID == nil {
			return nil, errors.New("receiver_account_id is required for debt payment to household member")
		}

		// Verify account exists and belongs to household
		account, err := s.accountsRepo.GetByID(ctx, *input.ReceiverAccountID)
		if err != nil {
			if errors.Is(err, accounts.ErrAccountNotFound) {
				return nil, errors.New("receiver account not found")
			}
			return nil, err
		}
		if account.HouseholdID != householdID {
			return nil, ErrNotAuthorized
		}

		// Verify account type can receive income (only savings and cash)
		if !account.Type.CanReceiveIncome() {
			return nil, errors.New("receiver account must be of type savings or cash")
		}
	}

	// Verify participants belong to household (if SPLIT)
	if input.Type == TypeSplit {
		for _, p := range input.Participants {
			if p.ParticipantUserID != nil {
				isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *p.ParticipantUserID)
				if err != nil {
					return nil, err
				}
				if !isMember {
					return nil, ErrNotAuthorized
				}
			}
			// Contacts will be validated by FK constraint
		}
	}

	// Resolve category ID from category name if needed
	if input.Category != nil && *input.Category != "" && input.CategoryID == nil {
		// Look up category by name in household
		categoryID, err := s.repo.GetCategoryIDByName(ctx, householdID, *input.Category)
		if err != nil {
			// If category not found, log warning but continue (for backwards compatibility)
			s.logger.Warn("category not found", "category", *input.Category, "household_id", householdID)
		} else {
			input.CategoryID = &categoryID
		}
	}

	// Create movement
	movement, err := s.repo.Create(ctx, input, householdID)
	if err != nil {
		// Log failed creation attempt
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionMovementCreated,
			ResourceType: "movement",
			HouseholdID:  audit.StringPtr(householdID),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	// Log successful creation
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionMovementCreated,
		ResourceType: "movement",
		ResourceID:   audit.StringPtr(movement.ID),
		HouseholdID:  audit.StringPtr(householdID),
		NewValues:    audit.StructToMap(movement),
		Success:      true,
	})

	// Dual write to n8n (Google Sheets) if configured
	if s.n8nClient != nil {
		n8nMovement := s.convertToN8NMovement(movement)
		
		s.logger.Info("sending movement to n8n", 
			"movement_id", movement.ID, 
			"type", movement.Type, 
			"amount", movement.Amount)
		
		resp, err := s.n8nClient.RecordMovement(ctx, n8nMovement)
		if err != nil {
			s.logger.Error("failed to send movement to n8n", 
				"error", err, 
				"movement_id", movement.ID)
			return nil, ErrN8NUnavailable
		}
		s.logger.Info("movement sent to n8n successfully", 
			"movement_id", movement.ID, 
			"n8n_response", resp)
	}

	return movement, nil
}

// convertToN8NMovement converts a Movement to n8nclient.Movement format
func (s *service) convertToN8NMovement(m *Movement) *n8nclient.Movement {
	n8nMov := &n8nclient.Movement{
		ID:          m.ID,
		Fecha:       m.MovementDate.Format("2006-01-02"),
		Tipo:        "gasto", // All movements are "gasto" type in n8n
		Valor:       m.Amount,
		Descripcion: m.Description,
	}

	// Map English type to Spanish for Google Sheets compatibility
	switch m.Type {
	case TypeHousehold:
		n8nMov.SubTipo = "FAMILIAR"
	case TypeSplit:
		n8nMov.SubTipo = "COMPARTIDO"
	case TypeDebtPayment:
		n8nMov.SubTipo = "PAGO_DEUDA"
	}

	// Set payer name
	n8nMov.Pagador = m.PayerName

	// Set counterparty for DEBT_PAYMENT
	if m.Type == TypeDebtPayment && m.CounterpartyName != nil {
		n8nMov.Contraparte = *m.CounterpartyName
	}

	// Set category
	if m.CategoryName != nil {
		n8nMov.Categoria = *m.CategoryName
	}

	// Set payment method
	if m.PaymentMethodName != nil {
		n8nMov.MetodoPago = *m.PaymentMethodName
	}

	// Set participants for SPLIT
	if m.Type == TypeSplit && len(m.Participants) > 0 {
		n8nMov.Participantes = make([]n8nclient.Participante, len(m.Participants))
		for i, p := range m.Participants {
			n8nMov.Participantes[i] = n8nclient.Participante{
				Nombre:     p.ParticipantName,
				Porcentaje: p.Percentage,
			}
		}
	}

	return n8nMov
}

// GetByID retrieves a movement by ID
func (s *service) GetByID(ctx context.Context, userID, id string) (*Movement, error) {
	// Get movement
	movement, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user has access to this movement (belongs to same household)
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if movement.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	return movement, nil
}

// ListByHousehold retrieves all movements for the user's household
func (s *service) ListByHousehold(ctx context.Context, userID string, filters *ListMovementsFilters) (*ListMovementsResponse, error) {
	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Get movements
	movements, err := s.repo.ListByHousehold(ctx, householdID, filters)
	if err != nil {
		return nil, err
	}

	// Get totals
	totals, err := s.repo.GetTotals(ctx, householdID, filters)
	if err != nil {
		return nil, err
	}

	return &ListMovementsResponse{
		Movements: movements,
		Totals:    totals,
	}, nil
}

// GetDebtConsolidation calculates who owes whom based on SPLIT and DEBT_PAYMENT movements
func (s *service) GetDebtConsolidation(ctx context.Context, userID string, month *string) (*DebtConsolidationResponse, error) {
	// Get user's household
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Build filters
	filters := &ListMovementsFilters{}
	if month != nil {
		filters.Month = month
	}

	// Get all movements
	movements, err := s.repo.ListByHousehold(ctx, householdID, filters)
	if err != nil {
		return nil, err
	}

	// Calculate balances: map[debtorID][creditorID] = amount
	balanceMap := make(map[string]map[string]float64)
	balanceNames := make(map[string]string) // ID -> Name mapping
	// Track movements contributing to each debt: map[debtorID][creditorID] = []movements
	movementDetails := make(map[string]map[string][]DebtMovementDetail)

	for _, m := range movements {
		currency := m.Currency
		if currency == "" {
			currency = "COP"
		}

		// Handle SPLIT movements: participants owe the payer
		if m.Type == TypeSplit && len(m.Participants) > 0 {
			payerID := ""
			payerName := m.PayerName
			
			if m.PayerUserID != nil {
				payerID = *m.PayerUserID
			} else if m.PayerContactID != nil {
				payerID = *m.PayerContactID
			}
			
			if payerID != "" {
				balanceNames[payerID] = payerName
				
				for _, p := range m.Participants {
					participantID := ""
					participantName := p.ParticipantName
					
					if p.ParticipantUserID != nil {
						participantID = *p.ParticipantUserID
					} else if p.ParticipantContactID != nil {
						participantID = *p.ParticipantContactID
					}
					
					// Skip if participant is the payer (they don't owe themselves)
					if participantID == "" || participantID == payerID {
						continue
					}
					
					balanceNames[participantID] = participantName
					
					// Participant owes payer their share
					share := m.Amount * p.Percentage
					
					if balanceMap[participantID] == nil {
						balanceMap[participantID] = make(map[string]float64)
					}
					balanceMap[participantID][payerID] += share
					
					// Track movement detail
					if movementDetails[participantID] == nil {
						movementDetails[participantID] = make(map[string][]DebtMovementDetail)
					}
					movementDetails[participantID][payerID] = append(
						movementDetails[participantID][payerID],
						DebtMovementDetail{
							MovementID:   m.ID,
							Description:  m.Description,
							Amount:       share,
							MovementDate: m.MovementDate.Format("2006-01-02T15:04:05Z07:00"),
							Type:         string(TypeSplit),
							PayerID:      payerID,
							PayerName:    payerName,
						},
					)
				}
			}
		}

		// Handle DEBT_PAYMENT movements: counterparty owes payer (or vice versa)
		if m.Type == TypeDebtPayment {
			payerID := ""
			payerName := m.PayerName
			counterpartyID := ""
			counterpartyName := ""
			
			if m.PayerUserID != nil {
				payerID = *m.PayerUserID
			} else if m.PayerContactID != nil {
				payerID = *m.PayerContactID
			}
			
			if m.CounterpartyUserID != nil {
				counterpartyID = *m.CounterpartyUserID
			} else if m.CounterpartyContactID != nil {
				counterpartyID = *m.CounterpartyContactID
			}
			
			if m.CounterpartyName != nil {
				counterpartyName = *m.CounterpartyName
			}
			
			if payerID != "" && counterpartyID != "" {
				balanceNames[payerID] = payerName
				balanceNames[counterpartyID] = counterpartyName
				
				// Debt payment: payer pays counterparty
				// This REDUCES what payer owes counterparty
				if balanceMap[payerID] == nil {
					balanceMap[payerID] = make(map[string]float64)
				}
				balanceMap[payerID][counterpartyID] -= m.Amount
				
				// Track movement detail (negative amount for payment)
				if movementDetails[payerID] == nil {
					movementDetails[payerID] = make(map[string][]DebtMovementDetail)
				}
				movementDetails[payerID][counterpartyID] = append(
					movementDetails[payerID][counterpartyID],
					DebtMovementDetail{
						MovementID:   m.ID,
						Description:  m.Description,
						Amount:       -m.Amount, // Negative because it reduces debt
						MovementDate: m.MovementDate.Format("2006-01-02T15:04:05Z07:00"),
						Type:         string(TypeDebtPayment),
						PayerID:      payerID,      // Who made the payment
						PayerName:    payerName,    // Name of who made the payment
					},
				)
			}
		}
	}

	// Convert balance map to list of DebtBalance, netting out negative amounts
	var balances []DebtBalance
	processed := make(map[string]bool) // Track processed pairs to avoid duplicates

	for debtorID, creditors := range balanceMap {
		for creditorID, amount := range creditors {
			pairKey := debtorID + "|" + creditorID
			reversePairKey := creditorID + "|" + debtorID
			
			if processed[pairKey] || processed[reversePairKey] {
				continue
			}
			
			// Net out reverse debt if exists
			reverseAmount := 0.0
			if balanceMap[creditorID] != nil {
				reverseAmount = balanceMap[creditorID][debtorID]
			}
			
			netAmount := amount - reverseAmount
			
			// Combine movements from both directions
			movements := movementDetails[debtorID][creditorID]
			if movementDetails[creditorID] != nil {
				movements = append(movements, movementDetails[creditorID][debtorID]...)
			}
			
			// Include balance if:
			// 1. Net amount is positive (debtor owes creditor)
			// 2. Net amount is negative (creditor owes debtor - reverse)
			// 3. Net amount is zero BUT there are movements (debt was settled this month)
			if netAmount > 0.01 { // Small tolerance for floating point
				balances = append(balances, DebtBalance{
					DebtorID:     debtorID,
					DebtorName:   balanceNames[debtorID],
					CreditorID:   creditorID,
					CreditorName: balanceNames[creditorID],
					Amount:       netAmount,
					Currency:     "COP", // TODO: handle multi-currency
					Movements:    movements,
				})
				processed[pairKey] = true
			} else if netAmount < -0.01 {
				// Reverse direction
				balances = append(balances, DebtBalance{
					DebtorID:     creditorID,
					DebtorName:   balanceNames[creditorID],
					CreditorID:   debtorID,
					CreditorName: balanceNames[debtorID],
					Amount:       -netAmount,
					Currency:     "COP",
					Movements:    movements,
				})
				processed[reversePairKey] = true
			} else if len(movements) > 0 {
				// Balance is zero but there are movements - show it
				// Pick the direction with more debt-increasing movements
				debtIncreasing := 0.0
				for _, m := range movementDetails[debtorID][creditorID] {
					if m.Amount > 0 {
						debtIncreasing += m.Amount
					}
				}
				
				balances = append(balances, DebtBalance{
					DebtorID:     debtorID,
					DebtorName:   balanceNames[debtorID],
					CreditorID:   creditorID,
					CreditorName: balanceNames[creditorID],
					Amount:       0,
					Currency:     "COP",
					Movements:    movements,
				})
				processed[pairKey] = true
				processed[reversePairKey] = true
			} else {
				// Balanced out with no movements - don't show
				processed[pairKey] = true
				processed[reversePairKey] = true
			}
		}
	}

	// Calculate summary for household members
	// Get household members to identify internal vs external debts
	members, err := s.householdsRepo.GetMembers(ctx, householdID)
	if err != nil {
		// If we can't get members, skip summary calculation
		members = nil
	}

	var summary *DebtSummary
	if members != nil {
		// Build set of household member IDs
		memberIDs := make(map[string]bool)
		for _, member := range members {
			memberIDs[member.UserID] = true
		}

		theyOweUs := 0.0
		weOwe := 0.0

		for _, balance := range balances {
			debtorIsMember := memberIDs[balance.DebtorID]
			creditorIsMember := memberIDs[balance.CreditorID]

			// Only count if one side is a household member
			if debtorIsMember && !creditorIsMember {
				// Household member owes to external contact
				weOwe += balance.Amount
			} else if !debtorIsMember && creditorIsMember {
				// External contact owes to household member
				theyOweUs += balance.Amount
			}
			// If both are members or both are contacts, don't count (internal debts)
		}

		summary = &DebtSummary{
			TheyOweUs: theyOweUs,
			WeOwe:     weOwe,
		}
	}

	return &DebtConsolidationResponse{
		Balances: balances,
		Month:    month,
		Summary:  summary,
	}, nil
}

// Update updates a movement
func (s *service) Update(ctx context.Context, userID, id string, input *UpdateMovementInput) (*Movement, error) {
	// Validate input
	if err := input.Validate(); err != nil {
		return nil, err
	}

	// Get existing movement
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Verify user has access to this movement (belongs to same household)
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if existing.HouseholdID != householdID {
		return nil, ErrNotAuthorized
	}

	// Validate payer if being updated (must belong to household)
	if input.PayerUserID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *input.PayerUserID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, ErrNotAuthorized
		}
	}
	// Note: We don't validate contact ownership here - the FK constraint will handle it

	// Validate counterparty if being updated (must belong to household for DEBT_PAYMENT)
	if input.CounterpartyUserID != nil {
		isMember, err := s.householdsRepo.IsUserMember(ctx, householdID, *input.CounterpartyUserID)
		if err != nil {
			return nil, err
		}
		if !isMember {
			return nil, ErrNotAuthorized
		}
	}

	// Validate payment method if being updated (must belong to household)
	if input.PaymentMethodID != nil {
		pm, err := s.paymentMethodRepo.GetByID(ctx, *input.PaymentMethodID)
		if err != nil {
			return nil, err
		}
		if pm.HouseholdID != householdID {
			return nil, ErrNotAuthorized
		}
	}

	// Validate receiver account if being updated (for DEBT_PAYMENT with household member receiver)
	// Type cannot be changed during update, so use existing movement type
	counterpartyUserID := existing.CounterpartyUserID
	if input.CounterpartyUserID != nil {
		counterpartyUserID = input.CounterpartyUserID
	}

	if existing.Type == TypeDebtPayment && counterpartyUserID != nil {
		// Receiver account is required
		receiverAccountID := input.ReceiverAccountID
		if receiverAccountID == nil && existing.ReceiverAccountID != nil {
			// Keep existing if not being updated
			receiverAccountID = existing.ReceiverAccountID
		}

		if receiverAccountID == nil {
			return nil, errors.New("receiver_account_id is required for debt payment to household member")
		}

		// Verify account exists and belongs to household
		account, err := s.accountsRepo.GetByID(ctx, *receiverAccountID)
		if err != nil {
			if errors.Is(err, accounts.ErrAccountNotFound) {
				return nil, errors.New("receiver account not found")
			}
			return nil, err
		}
		if account.HouseholdID != householdID {
			return nil, ErrNotAuthorized
		}

		// Verify account type can receive income (only savings and cash)
		if !account.Type.CanReceiveIncome() {
			return nil, errors.New("receiver account must be of type savings or cash")
		}
	}

	// Resolve category ID from category name if needed (for backwards compatibility)
	if input.Category != nil && *input.Category != "" {
		// Look up category by name in household
		categoryID, err := s.repo.GetCategoryIDByName(ctx, householdID, *input.Category)
		if err != nil {
			// If category not found, log warning but continue
			s.logger.Warn("category not found during update", "category", *input.Category, "household_id", householdID)
			// Set to nil so it doesn't try to update with invalid value
			input.Category = nil
		} else {
			// Replace the category name with the category ID
			input.Category = &categoryID
		}
	}

	// Additional validation: payer != counterparty for DEBT_PAYMENT
	// Must check final values (input merged with existing)
	if existing.Type == TypeDebtPayment {
		finalPayerUserID := existing.PayerUserID
		if input.PayerUserID != nil {
			finalPayerUserID = input.PayerUserID
		}
		
		finalPayerContactID := existing.PayerContactID
		if input.PayerContactID != nil {
			finalPayerContactID = input.PayerContactID
		}
		
		finalCounterpartyUserID := counterpartyUserID // Already computed above (line 630)
		
		finalCounterpartyContactID := existing.CounterpartyContactID
		if input.CounterpartyContactID != nil {
			finalCounterpartyContactID = input.CounterpartyContactID
		}
		
		// Check if payer and counterparty are the same (both users)
		if finalPayerUserID != nil && finalCounterpartyUserID != nil {
			if *finalPayerUserID == *finalCounterpartyUserID {
				return nil, errors.New("payer and counterparty cannot be the same person")
			}
		}
		
		// Check if payer and counterparty are the same (both contacts)
		if finalPayerContactID != nil && finalCounterpartyContactID != nil {
			if *finalPayerContactID == *finalCounterpartyContactID {
				return nil, errors.New("payer and counterparty cannot be the same contact")
			}
		}
	}

	// Type-specific validations (type cannot change, use existing.Type)
	switch existing.Type {
	case TypeDebtPayment:
		// DEBT_PAYMENT must have a counterparty
		finalCounterpartyUserID := counterpartyUserID // Already computed above
		finalCounterpartyContactID := existing.CounterpartyContactID
		if input.CounterpartyContactID != nil {
			finalCounterpartyContactID = input.CounterpartyContactID
		}
		
		if finalCounterpartyUserID == nil && finalCounterpartyContactID == nil {
			return nil, errors.New("counterparty is required for debt payment")
		}
		
	case TypeSplit:
		// SPLIT must have participants (if being updated)
		if input.Participants != nil && len(*input.Participants) == 0 {
			return nil, errors.New("participants are required for split movements")
		}
	}

	// Update movement
	updated, err := s.repo.Update(ctx, id, input)
	if err != nil {
		// Log failed update attempt
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionMovementUpdated,
			ResourceType: "movement",
			ResourceID:   audit.StringPtr(id),
			HouseholdID:  audit.StringPtr(householdID),
			OldValues:    audit.StructToMap(existing),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return nil, err
	}

	// Log successful update
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionMovementUpdated,
		ResourceType: "movement",
		ResourceID:   audit.StringPtr(id),
		HouseholdID:  audit.StringPtr(householdID),
		OldValues:    audit.StructToMap(existing),
		NewValues:    audit.StructToMap(updated),
		Success:      true,
	})

	// Note: We don't dual-write updates to n8n for now
	// Google Sheets will have the original data until migration
	s.logger.Info("movement updated", 
		"movement_id", id, 
		"note", "update not synced to Google Sheets")

	return updated, nil
}

// Delete deletes a movement
func (s *service) Delete(ctx context.Context, userID, id string) error {
	// Get existing movement
	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Verify user has access to this movement (belongs to same household)
	householdID, err := s.householdsRepo.GetUserHouseholdID(ctx, userID)
	if err != nil {
		return err
	}

	if existing.HouseholdID != householdID {
		return ErrNotAuthorized
	}

	// Delete movement
	if err := s.repo.Delete(ctx, id); err != nil {
		// Log failed deletion attempt
		s.auditService.LogAsync(ctx, &audit.LogInput{
			UserID:       audit.StringPtr(userID),
			Action:       audit.ActionMovementDeleted,
			ResourceType: "movement",
			ResourceID:   audit.StringPtr(id),
			HouseholdID:  audit.StringPtr(householdID),
			OldValues:    audit.StructToMap(existing),
			Success:      false,
			ErrorMessage: audit.StringPtr(err.Error()),
		})
		return err
	}

	// Log successful deletion
	s.auditService.LogAsync(ctx, &audit.LogInput{
		UserID:       audit.StringPtr(userID),
		Action:       audit.ActionMovementDeleted,
		ResourceType: "movement",
		ResourceID:   audit.StringPtr(id),
		HouseholdID:  audit.StringPtr(householdID),
		OldValues:    audit.StructToMap(existing),
		Success:      true,
	})

	// Note: We don't dual-write deletes to n8n for now
	// Google Sheets will keep the data until manual cleanup
	s.logger.Info("movement deleted", 
		"movement_id", id, 
		"note", "deletion not synced to Google Sheets")

	return nil
}
