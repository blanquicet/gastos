package categorygroups

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// repository implements Repository using PostgreSQL
type repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new category groups repository
func NewRepository(pool *pgxpool.Pool) Repository {
	return &repository{pool: pool}
}

// ListByHousehold returns all category groups with their categories for a household
func (r *repository) ListByHousehold(ctx context.Context, householdID string) ([]*CategoryGroup, error) {
	query := `
		SELECT 
			cg.id, cg.household_id, cg.name, cg.icon, cg.display_order,
			cg.is_active, cg.created_at, cg.updated_at,
			c.id as category_id, c.name as category_name, c.icon as category_icon
		FROM category_groups cg
		LEFT JOIN categories c ON c.category_group_id = cg.id AND c.is_active = true
		WHERE cg.household_id = $1 AND cg.is_active = true
		ORDER BY cg.display_order ASC, cg.name ASC, c.display_order ASC, c.name ASC
	`

	rows, err := r.pool.Query(ctx, query, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Map to group categories by group ID
	groupsMap := make(map[string]*CategoryGroup)
	var groupsOrder []string // Track order of groups

	for rows.Next() {
		var (
			groupID          string
			groupHouseholdID string
			groupName        string
			groupIcon        *string
			groupDisplayOrder int
			groupIsActive    bool
			groupCreatedAt   time.Time
			groupUpdatedAt   time.Time
			categoryID       *string
			categoryName     *string
			categoryIcon     *string
		)

		err := rows.Scan(
			&groupID,
			&groupHouseholdID,
			&groupName,
			&groupIcon,
			&groupDisplayOrder,
			&groupIsActive,
			&groupCreatedAt,
			&groupUpdatedAt,
			&categoryID,
			&categoryName,
			&categoryIcon,
		)
		if err != nil {
			return nil, err
		}

		// Create group if not exists
		if _, exists := groupsMap[groupID]; !exists {
			groupsMap[groupID] = &CategoryGroup{
				ID:           groupID,
				HouseholdID:  groupHouseholdID,
				Name:         groupName,
				Icon:         groupIcon,
				DisplayOrder: groupDisplayOrder,
				IsActive:     groupIsActive,
				CreatedAt:    groupCreatedAt,
				UpdatedAt:    groupUpdatedAt,
				Categories:   []Category{},
			}
			groupsOrder = append(groupsOrder, groupID)
		}

		// Add category to group if exists
		if categoryID != nil && categoryName != nil {
			groupsMap[groupID].Categories = append(groupsMap[groupID].Categories, Category{
				ID:   *categoryID,
				Name: *categoryName,
				Icon: categoryIcon,
			})
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Convert map to ordered slice
	groups := make([]*CategoryGroup, 0, len(groupsOrder))
	for _, groupID := range groupsOrder {
		groups = append(groups, groupsMap[groupID])
	}

	return groups, nil
}
