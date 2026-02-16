package households

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository implements HouseholdRepository using PostgreSQL
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new household repository
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Create creates a new household and adds the creator as the first owner
func (r *Repository) Create(ctx context.Context, name, createdBy string) (*Household, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Create household
	var household Household
	err = tx.QueryRow(ctx, `
		INSERT INTO households (name, created_by)
		VALUES ($1, $2)
		RETURNING id, name, created_by, created_at, updated_at, currency, timezone
	`, name, createdBy).Scan(
		&household.ID,
		&household.Name,
		&household.CreatedBy,
		&household.CreatedAt,
		&household.UpdatedAt,
		&household.Currency,
		&household.Timezone,
	)
	if err != nil {
		return nil, err
	}

	// Add creator as owner
	_, err = tx.Exec(ctx, `
		INSERT INTO household_members (household_id, user_id, role)
		VALUES ($1, $2, $3)
	`, household.ID, createdBy, RoleOwner)
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &household, nil
}

// GetByID retrieves a household by ID
func (r *Repository) GetByID(ctx context.Context, id string) (*Household, error) {
	var household Household
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, created_by, created_at, updated_at, currency, timezone
		FROM households
		WHERE id = $1
	`, id).Scan(
		&household.ID,
		&household.Name,
		&household.CreatedBy,
		&household.CreatedAt,
		&household.UpdatedAt,
		&household.Currency,
		&household.Timezone,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrHouseholdNotFound
	}
	if err != nil {
		return nil, err
	}
	return &household, nil
}

// Update updates a household's name
func (r *Repository) Update(ctx context.Context, id, name string) (*Household, error) {
	var household Household
	err := r.pool.QueryRow(ctx, `
		UPDATE households
		SET name = $2, updated_at = NOW()
		WHERE id = $1
		RETURNING id, name, created_by, created_at, updated_at, currency, timezone
	`, id, name).Scan(
		&household.ID,
		&household.Name,
		&household.CreatedBy,
		&household.CreatedAt,
		&household.UpdatedAt,
		&household.Currency,
		&household.Timezone,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrHouseholdNotFound
	}
	if err != nil {
		return nil, err
	}
	return &household, nil
}

// Delete deletes a household (cascades to members, contacts, invitations)
func (r *Repository) Delete(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `DELETE FROM households WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrHouseholdNotFound
	}
	return nil
}

// ListByUser retrieves all households where the user is a member
func (r *Repository) ListByUser(ctx context.Context, userID string) ([]*Household, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT h.id, h.name, h.created_by, h.created_at, h.updated_at, h.currency, h.timezone
		FROM households h
		INNER JOIN household_members hm ON h.id = hm.household_id
		WHERE hm.user_id = $1
		ORDER BY h.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var households []*Household
	for rows.Next() {
		var h Household
		err := rows.Scan(
			&h.ID,
			&h.Name,
			&h.CreatedBy,
			&h.CreatedAt,
			&h.UpdatedAt,
			&h.Currency,
			&h.Timezone,
		)
		if err != nil {
			return nil, err
		}
		households = append(households, &h)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return households, nil
}

// AddMember adds a user to a household
func (r *Repository) AddMember(ctx context.Context, householdID, userID string, role HouseholdRole) (*HouseholdMember, error) {
	var member HouseholdMember
	err := r.pool.QueryRow(ctx, `
		INSERT INTO household_members (household_id, user_id, role)
		VALUES ($1, $2, $3)
		RETURNING id, household_id, user_id, role, joined_at
	`, householdID, userID, role).Scan(
		&member.ID,
		&member.HouseholdID,
		&member.UserID,
		&member.Role,
		&member.JoinedAt,
	)
	if err != nil {
		// Check for unique constraint violation (user already in household)
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			return nil, ErrUserAlreadyMember
		}
		return nil, err
	}
	return &member, nil
}

// RemoveMember removes a user from a household
func (r *Repository) RemoveMember(ctx context.Context, householdID, userID string) error {
	result, err := r.pool.Exec(ctx, `
		DELETE FROM household_members
		WHERE household_id = $1 AND user_id = $2
	`, householdID, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrMemberNotFound
	}
	return nil
}

// UpdateMemberRole updates a member's role
func (r *Repository) UpdateMemberRole(ctx context.Context, householdID, userID string, role HouseholdRole) (*HouseholdMember, error) {
	var member HouseholdMember
	err := r.pool.QueryRow(ctx, `
		UPDATE household_members
		SET role = $3
		WHERE household_id = $1 AND user_id = $2
		RETURNING id, household_id, user_id, role, joined_at
	`, householdID, userID, role).Scan(
		&member.ID,
		&member.HouseholdID,
		&member.UserID,
		&member.Role,
		&member.JoinedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrMemberNotFound
	}
	if err != nil {
		return nil, err
	}
	return &member, nil
}

// GetMembers retrieves all members of a household with user info
func (r *Repository) GetMembers(ctx context.Context, householdID string) ([]*HouseholdMember, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT 
			hm.id, hm.household_id, hm.user_id, hm.role, hm.joined_at,
			u.email, u.name
		FROM household_members hm
		INNER JOIN users u ON hm.user_id = u.id
		WHERE hm.household_id = $1
		ORDER BY hm.role DESC, hm.joined_at ASC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*HouseholdMember
	for rows.Next() {
		var m HouseholdMember
		err := rows.Scan(
			&m.ID,
			&m.HouseholdID,
			&m.UserID,
			&m.Role,
			&m.JoinedAt,
			&m.UserEmail,
			&m.UserName,
		)
		if err != nil {
			return nil, err
		}
		members = append(members, &m)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return members, nil
}

// GetMemberByUserID retrieves a specific member by user ID
func (r *Repository) GetMemberByUserID(ctx context.Context, householdID, userID string) (*HouseholdMember, error) {
	var member HouseholdMember
	err := r.pool.QueryRow(ctx, `
		SELECT 
			hm.id, hm.household_id, hm.user_id, hm.role, hm.joined_at,
			u.email, u.name
		FROM household_members hm
		INNER JOIN users u ON hm.user_id = u.id
		WHERE hm.household_id = $1 AND hm.user_id = $2
	`, householdID, userID).Scan(
		&member.ID,
		&member.HouseholdID,
		&member.UserID,
		&member.Role,
		&member.JoinedAt,
		&member.UserEmail,
		&member.UserName,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrMemberNotFound
	}
	if err != nil {
		return nil, err
	}
	return &member, nil
}

// CountOwners counts the number of owners in a household
func (r *Repository) CountOwners(ctx context.Context, householdID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM household_members
		WHERE household_id = $1 AND role = $2
	`, householdID, RoleOwner).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// CreateContact creates a new contact
func (r *Repository) CreateContact(ctx context.Context, contact *Contact) (*Contact, error) {
	var c Contact
	err := r.pool.QueryRow(ctx, `
		INSERT INTO contacts (household_id, name, email, phone, linked_user_id, notes, is_active, link_status, link_requested_at, link_responded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
	`, contact.HouseholdID, contact.Name, contact.Email, contact.Phone, contact.LinkedUserID, contact.Notes, contact.IsActive,
		contact.LinkStatus, contact.LinkRequestedAt, contact.LinkRespondedAt).Scan(
		&c.ID,
		&c.HouseholdID,
		&c.Name,
		&c.Email,
		&c.Phone,
		&c.LinkedUserID,
		&c.Notes,
		&c.LinkStatus,
		&c.LinkRequestedAt,
		&c.LinkRespondedAt,
		&c.WasUnlinkedAt,
		&c.IsActive,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	c.IsRegistered = c.LinkedUserID != nil
	return &c, nil
}

// GetContact retrieves a contact by ID
func (r *Repository) GetContact(ctx context.Context, id string) (*Contact, error) {
	var c Contact
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
		FROM contacts
		WHERE id = $1
	`, id).Scan(
		&c.ID,
		&c.HouseholdID,
		&c.Name,
		&c.Email,
		&c.Phone,
		&c.LinkedUserID,
		&c.Notes,
		&c.LinkStatus,
		&c.LinkRequestedAt,
		&c.LinkRespondedAt,
		&c.WasUnlinkedAt,
		&c.IsActive,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrContactNotFound
	}
	if err != nil {
		return nil, err
	}
	c.IsRegistered = c.LinkedUserID != nil
	return &c, nil
}

// UpdateContact updates a contact
func (r *Repository) UpdateContact(ctx context.Context, contact *Contact, isActive *bool) (*Contact, error) {
	var query string
	var args []interface{}
	
	if isActive != nil {
		// Update including is_active
		query = `
			UPDATE contacts
			SET name = $2, email = $3, phone = $4, linked_user_id = $5, notes = $6, is_active = $7, updated_at = NOW()
			WHERE id = $1
			RETURNING id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
		`
		args = []interface{}{contact.ID, contact.Name, contact.Email, contact.Phone, contact.LinkedUserID, contact.Notes, *isActive}
	} else {
		// Update without changing is_active
		query = `
			UPDATE contacts
			SET name = $2, email = $3, phone = $4, linked_user_id = $5, notes = $6, updated_at = NOW()
			WHERE id = $1
			RETURNING id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
		`
		args = []interface{}{contact.ID, contact.Name, contact.Email, contact.Phone, contact.LinkedUserID, contact.Notes}
	}
	
	var c Contact
	var isActiveFromDB bool
	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&c.ID,
		&c.HouseholdID,
		&c.Name,
		&c.Email,
		&c.Phone,
		&c.LinkedUserID,
		&c.Notes,
		&c.LinkStatus,
		&c.LinkRequestedAt,
		&c.LinkRespondedAt,
		&c.WasUnlinkedAt,
		&isActiveFromDB,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrContactNotFound
	}
	if err != nil {
		return nil, err
	}
	c.IsActive = isActiveFromDB
	c.IsRegistered = c.LinkedUserID != nil
	return &c, nil
}

// DeleteContact deletes a contact
func (r *Repository) DeleteContact(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `DELETE FROM contacts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrContactNotFound
	}
	return nil
}

// ListContacts retrieves all contacts for a household
func (r *Repository) ListContacts(ctx context.Context, householdID string) ([]*Contact, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
		FROM contacts
		WHERE household_id = $1
		ORDER BY name ASC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contacts []*Contact
	for rows.Next() {
		var c Contact
		err := rows.Scan(
			&c.ID,
			&c.HouseholdID,
			&c.Name,
			&c.Email,
			&c.Phone,
			&c.LinkedUserID,
			&c.Notes,
			&c.LinkStatus,
			&c.LinkRequestedAt,
			&c.LinkRespondedAt,
			&c.WasUnlinkedAt,
			&c.IsActive,
			&c.CreatedAt,
			&c.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		c.IsRegistered = c.LinkedUserID != nil
		contacts = append(contacts, &c)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return contacts, nil
}

// FindContactByEmail finds a contact by email in a household
func (r *Repository) FindContactByEmail(ctx context.Context, householdID, email string) (*Contact, error) {
	var c Contact
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
		FROM contacts
		WHERE household_id = $1 AND email = $2
	`, householdID, email).Scan(
		&c.ID,
		&c.HouseholdID,
		&c.Name,
		&c.Email,
		&c.Phone,
		&c.LinkedUserID,
		&c.Notes,
		&c.LinkStatus,
		&c.LinkRequestedAt,
		&c.LinkRespondedAt,
		&c.WasUnlinkedAt,
		&c.IsActive,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrContactNotFound
	}
	if err != nil {
		return nil, err
	}
	c.IsRegistered = c.LinkedUserID != nil
	return &c, nil
}

// FindLinkedContactsByHousehold finds all contacts across other households
// that are linked to ANY member of the given household.
// This enables household-wide visibility: if Jose links with Maria,
// Caro (Jose's household member) also sees cross-household movements.
func (r *Repository) FindLinkedContactsByHousehold(ctx context.Context, householdID string) ([]LinkedContact, error) {
	query := `
		SELECT DISTINCT c.id, c.household_id, h.name, c.name
		FROM contacts c
		JOIN households h ON c.household_id = h.id
		JOIN household_members hm ON hm.household_id = $1
		WHERE c.linked_user_id = hm.user_id
		  AND c.household_id != $1
		  AND c.is_active = true
		  AND c.link_status = 'ACCEPTED'
	`
	rows, err := r.pool.Query(ctx, query, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contacts []LinkedContact
	for rows.Next() {
		var lc LinkedContact
		err := rows.Scan(&lc.ContactID, &lc.HouseholdID, &lc.HouseholdName, &lc.ContactName)
		if err != nil {
			return nil, err
		}
		contacts = append(contacts, lc)
	}
	return contacts, rows.Err()
}

// ListPendingLinkRequests lists all pending link requests for a user
func (r *Repository) ListPendingLinkRequests(ctx context.Context, userID string) ([]LinkRequest, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT c.id, c.name, u.name, h.name, c.household_id, c.link_requested_at
		FROM contacts c
		JOIN households h ON c.household_id = h.id
		JOIN household_members hm ON hm.household_id = h.id AND hm.role = 'owner'
		JOIN users u ON u.id = hm.user_id
		WHERE c.linked_user_id = $1
		  AND c.link_status = 'PENDING'
		ORDER BY c.link_requested_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []LinkRequest
	for rows.Next() {
		var lr LinkRequest
		err := rows.Scan(&lr.ContactID, &lr.ContactName, &lr.RequesterName, &lr.HouseholdName, &lr.HouseholdID, &lr.RequestedAt)
		if err != nil {
			return nil, err
		}
		requests = append(requests, lr)
	}
	return requests, rows.Err()
}

// CountPendingLinkRequests counts pending link requests AND unlink notifications for a user
func (r *Repository) CountPendingLinkRequests(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT (
			SELECT COUNT(*) FROM contacts
			WHERE linked_user_id = $1 AND link_status = 'PENDING'
		) + (
			SELECT COUNT(*) FROM contacts c
			JOIN household_members hm ON hm.household_id = c.household_id
			WHERE hm.user_id = $1 AND c.was_unlinked_at IS NOT NULL
		)
	`, userID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// UpdateContactLinkStatus updates the link_status and link_responded_at of a contact
func (r *Repository) UpdateContactLinkStatus(ctx context.Context, contactID string, status string) error {
	result, err := r.pool.Exec(ctx, `
		UPDATE contacts
		SET link_status = $2, link_responded_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, contactID, status)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrContactNotFound
	}
	return nil
}

// UpdateContactLinkedUser sets linked_user_id and link_status on a contact
func (r *Repository) UpdateContactLinkedUser(ctx context.Context, contactID string, linkedUserID string, linkStatus string) error {
	now := time.Now()
	result, err := r.pool.Exec(ctx, `
		UPDATE contacts
		SET linked_user_id = $2, link_status = $3, link_requested_at = $4, updated_at = NOW()
		WHERE id = $1
	`, contactID, linkedUserID, linkStatus, now)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrContactNotFound
	}
	return nil
}

// UnlinkContact clears the linked_user_id and resets link status
func (r *Repository) UnlinkContact(ctx context.Context, contactID string) error {
	result, err := r.pool.Exec(ctx, `
		UPDATE contacts
		SET linked_user_id = NULL, link_status = 'NONE', link_requested_at = NULL, link_responded_at = NULL, updated_at = NOW()
		WHERE id = $1
	`, contactID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrContactNotFound
	}
	return nil
}

// SetWasUnlinkedAt sets was_unlinked_at on a contact (notification for the other side)
func (r *Repository) SetWasUnlinkedAt(ctx context.Context, contactID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE contacts SET was_unlinked_at = NOW(), updated_at = NOW() WHERE id = $1
	`, contactID)
	return err
}

// DismissUnlinkBanner clears was_unlinked_at on a contact
func (r *Repository) DismissUnlinkBanner(ctx context.Context, contactID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE contacts SET was_unlinked_at = NULL, updated_at = NOW() WHERE id = $1
	`, contactID)
	return err
}

// FindContactByLinkedUserID finds a contact in a household that links to a specific user
func (r *Repository) FindContactByLinkedUserID(ctx context.Context, householdID, linkedUserID string) (*Contact, error) {
	var c Contact
	var isActiveFromDB bool
	err := r.pool.QueryRow(ctx, `
		SELECT id, household_id, name, email, phone, linked_user_id, notes, link_status, link_requested_at, link_responded_at, was_unlinked_at, is_active, created_at, updated_at
		FROM contacts
		WHERE household_id = $1 AND linked_user_id = $2
		LIMIT 1
	`, householdID, linkedUserID).Scan(
		&c.ID,
		&c.HouseholdID,
		&c.Name,
		&c.Email,
		&c.Phone,
		&c.LinkedUserID,
		&c.Notes,
		&c.LinkStatus,
		&c.LinkRequestedAt,
		&c.LinkRespondedAt,
		&c.WasUnlinkedAt,
		&isActiveFromDB,
		&c.CreatedAt,
		&c.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrContactNotFound
	}
	if err != nil {
		return nil, err
	}
	c.IsActive = isActiveFromDB
	c.IsRegistered = c.LinkedUserID != nil
	return &c, nil
}

// CreateInvitation creates a new household invitation
func (r *Repository) CreateInvitation(ctx context.Context, householdID, email, token, invitedBy string) (*HouseholdInvitation, error) {
	var inv HouseholdInvitation
	err := r.pool.QueryRow(ctx, `
		INSERT INTO household_invitations (household_id, email, token, invited_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, household_id, email, token, invited_by, expires_at, accepted_at, created_at
	`, householdID, email, token, invitedBy).Scan(
		&inv.ID,
		&inv.HouseholdID,
		&inv.Email,
		&inv.Token,
		&inv.InvitedBy,
		&inv.ExpiresAt,
		&inv.AcceptedAt,
		&inv.CreatedAt,
	)
	if err != nil {
		// Check for unique constraint violation (duplicate invitation)
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			return nil, errors.New("invitation already exists for this email")
		}
		return nil, err
	}
	return &inv, nil
}

// GetInvitationByToken retrieves an invitation by token with household info
func (r *Repository) GetInvitationByToken(ctx context.Context, token string) (*HouseholdInvitation, error) {
	var inv HouseholdInvitation
	err := r.pool.QueryRow(ctx, `
		SELECT 
			i.id, i.household_id, i.email, i.token, i.invited_by, 
			i.expires_at, i.accepted_at, i.created_at,
			h.name, u.name
		FROM household_invitations i
		INNER JOIN households h ON i.household_id = h.id
		INNER JOIN users u ON i.invited_by = u.id
		WHERE i.token = $1
	`, token).Scan(
		&inv.ID,
		&inv.HouseholdID,
		&inv.Email,
		&inv.Token,
		&inv.InvitedBy,
		&inv.ExpiresAt,
		&inv.AcceptedAt,
		&inv.CreatedAt,
		&inv.HouseholdName,
		&inv.InviterName,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrInvitationNotFound
	}
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

// AcceptInvitation marks an invitation as accepted
func (r *Repository) AcceptInvitation(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx, `
		UPDATE household_invitations
		SET accepted_at = NOW()
		WHERE id = $1 AND accepted_at IS NULL
	`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrInvitationNotFound
	}
	return nil
}

// ListPendingInvitations retrieves all pending invitations for a household
func (r *Repository) ListPendingInvitations(ctx context.Context, householdID string) ([]*HouseholdInvitation, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT 
			i.id, i.household_id, i.email, i.token, i.invited_by, 
			i.expires_at, i.accepted_at, i.created_at,
			u.name
		FROM household_invitations i
		INNER JOIN users u ON i.invited_by = u.id
		WHERE i.household_id = $1 AND i.accepted_at IS NULL
		ORDER BY i.created_at DESC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []*HouseholdInvitation
	for rows.Next() {
		var inv HouseholdInvitation
		err := rows.Scan(
			&inv.ID,
			&inv.HouseholdID,
			&inv.Email,
			&inv.Token,
			&inv.InvitedBy,
			&inv.ExpiresAt,
			&inv.AcceptedAt,
			&inv.CreatedAt,
			&inv.InviterName,
		)
		if err != nil {
			return nil, err
		}
		invitations = append(invitations, &inv)
	}

	if err = rows.Err(); err != nil {
		return nil, err
	}

	return invitations, nil
}

// GetUserHouseholdID gets the household ID for a user (first household they belong to)
func (r *Repository) GetUserHouseholdID(ctx context.Context, userID string) (string, error) {
	var householdID string
	err := r.pool.QueryRow(ctx, `
		SELECT household_id 
		FROM household_members 
		WHERE user_id = $1
		LIMIT 1
	`, userID).Scan(&householdID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errors.New("user has no household")
		}
		return "", err
	}

	return householdID, nil
}

// IsUserMember checks if a user is a member of a household
func (r *Repository) IsUserMember(ctx context.Context, householdID, userID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM household_members 
			WHERE household_id = $1 AND user_id = $2
		)
	`, householdID, userID).Scan(&exists)

	return exists, err
}

