package movements

import (
	"context"
	"log/slog"

	"github.com/blanquicet/gastos/backend/internal/households"
	"github.com/blanquicet/gastos/backend/internal/n8nclient"
	"github.com/blanquicet/gastos/backend/internal/paymentmethods"
)

// service implements Service interface
type service struct {
	repo              Repository
	householdsRepo    households.HouseholdRepository
	paymentMethodRepo paymentmethods.Repository
	n8nClient         *n8nclient.Client
	logger            *slog.Logger
}

// NewService creates a new movements service
func NewService(
	repo Repository,
	householdsRepo households.HouseholdRepository,
	paymentMethodRepo paymentmethods.Repository,
	n8nClient *n8nclient.Client,
	logger *slog.Logger,
) Service {
	return &service{
		repo:              repo,
		householdsRepo:    householdsRepo,
		paymentMethodRepo: paymentMethodRepo,
		n8nClient:         n8nClient,
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

	// Create movement
	movement, err := s.repo.Create(ctx, input, householdID)
	if err != nil {
		return nil, err
	}

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
	if m.Category != nil {
		n8nMov.Categoria = *m.Category
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
				
				// Debt payment REDUCES what counterparty owes payer
				// (or increases what payer owes counterparty if it's a repayment)
				if balanceMap[counterpartyID] == nil {
					balanceMap[counterpartyID] = make(map[string]float64)
				}
				balanceMap[counterpartyID][payerID] -= m.Amount
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
			
			// Only include non-zero balances
			if netAmount > 0.01 { // Small tolerance for floating point
				balances = append(balances, DebtBalance{
					DebtorID:     debtorID,
					DebtorName:   balanceNames[debtorID],
					CreditorID:   creditorID,
					CreditorName: balanceNames[creditorID],
					Amount:       netAmount,
					Currency:     "COP", // TODO: handle multi-currency
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
				})
				processed[reversePairKey] = true
			} else {
				// Balanced out - mark as processed
				processed[pairKey] = true
				processed[reversePairKey] = true
			}
		}
	}

	return &DebtConsolidationResponse{
		Balances: balances,
		Month:    month,
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

	// Update movement
	updated, err := s.repo.Update(ctx, id, input)
	if err != nil {
		return nil, err
	}

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
		return err
	}

	// Note: We don't dual-write deletes to n8n for now
	// Google Sheets will keep the data until manual cleanup
	s.logger.Info("movement deleted", 
		"movement_id", id, 
		"note", "deletion not synced to Google Sheets")

	return nil
}
