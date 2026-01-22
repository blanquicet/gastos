# Phase 8: Recurring Movements (Gastos Periódicos)

> **Current Status:** 🚧 IN PROGRESS - Backend COMPLETE, Frontend TODO
>
> This phase introduces recurring movement templates that can automatically create movements on a schedule,
> or serve as form pre-fill templates for manual entry.
> Primary use case: monthly debts, rent, subscriptions, utilities, and other recurring expenses.

**Architecture:**

- Recurring movement templates: PostgreSQL
- Auto-generation service: Go backend (scheduled job)
- Template management UI: Frontend (future - manual DB entry for now)
- PostgreSQL only (no Google Sheets dual-write)

**Relationship to other phases:**

- Builds on Phase 5 (movements system)
- Requires categories to be foreign keys (migration from VARCHAR to category_id)
- See Phase 6 for categories and budgets context
- See `FUTURE_VISION.md` for long-term product vision

---

## 🎯 Goals

### Primary Goals

1. **Enable recurring movement templates**
   - Store template configuration (amount, category, payer, participants, schedule)
   - Three configurations:
     - FIXED + auto-generate: Auto-creates movements on schedule (e.g., rent)
     - FIXED + manual: Appears in dropdown for form pre-fill (e.g., annual insurance)
     - VARIABLE: Appears in dropdown, user enters amount (e.g., utilities)
   - Support multiple recurrence patterns (monthly, yearly, one-time)

2. **Flexible template usage**
   - Templates serve dual purpose: auto-generation AND form pre-fill
   - Auto-generation: Only for templates with `auto_generate=true`
   - Dropdown pre-fill: ALL templates appear when user selects category
   - Role inversion: Template for SPLIT auto-generates, but can also pre-fill DEBT_PAYMENT (inverting payer/counterparty)

3. **Template lifecycle management**
   - Create, edit, delete templates
   - Edit single instance, all instances, or future instances
   - Delete single instance, all instances, or future instances
   - Deactivate templates (stop future generation)

4. **Migration: Category as foreign key**
   - Change `movements.category` from VARCHAR(100) to `category_id` UUID
   - Maintain backward compatibility during transition
   - Map existing category names to category IDs

### Why This Change?

**Current limitations:**
- No way to automate recurring expenses (rent, subscriptions, monthly debts)
- Manual entry for predictable monthly expenses is tedious
- Variable expenses (utilities) require repetitive data entry
- Creating debt payments requires re-entering same data as original expense

**Solution:**
- Templates reduce manual work for ALL recurring expenses
- Auto-generation for truly fixed expenses (rent auto-creates on 1st of month)
- Dropdown pre-fill for semi-predictable expenses (insurance, annual fees)
- Variable amount templates pre-fill everything except amount (utilities)
- Same template serves both SPLIT (expense) and DEBT_PAYMENT (payment) via role inversion
- Users can edit/delete individual instances without affecting template

---

## 📊 Database Schema

### Migration 030: Change movements.category to category_id

**Current state:**
```sql
-- movements table (from migration 016)
category VARCHAR(100), -- Stores category name as text
```

**New state:**
```sql
-- Add category_id as foreign key
ALTER TABLE movements 
ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE RESTRICT;

-- Create index
CREATE INDEX idx_movements_category ON movements(category_id) WHERE category_id IS NOT NULL;

-- Migrate existing data (run script to map category names → category IDs)
-- See backend/scripts/migrate_category_names_to_ids.sql

-- Once migration is complete, drop old column (future migration)
-- ALTER TABLE movements DROP COLUMN category;
```

**Migration strategy:**
1. Add `category_id` column (nullable initially)
2. Backfill `category_id` from `category` names using mapping script
3. Update backend to use `category_id` for new movements
4. Keep `category` column for backward compatibility (deprecate later)

**Business rules:**
- Backend/Frontend MUST provide `category_id` when creating movements
- DB allows NULL (for flexibility), but application enforces NOT NULL
- Cannot delete category if referenced by movements (ON DELETE RESTRICT)

---

### Migration 031: Create recurring_movement_templates table

```sql
-- Create recurrence_pattern enum
CREATE TYPE recurrence_pattern AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

-- Create amount_type enum
CREATE TYPE amount_type AS ENUM ('FIXED', 'VARIABLE');

-- Create recurring_movement_templates table
-- Note: Templates serve dual purpose:
--   1. Auto-generation (if auto_generate=true and amount_type=FIXED)
--   2. Form pre-fill (always available in dropdown when category selected)
CREATE TABLE recurring_movement_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Template metadata
    name VARCHAR(200) NOT NULL, -- e.g., "Arriendo", "Servicios", "Internet"
    description TEXT, -- Optional additional description
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Movement template data (mirrors movements table)
    type movement_type NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    
    -- Amount configuration
    amount_type amount_type NOT NULL,
    amount DECIMAL(15, 2) CHECK (
        (amount_type = 'FIXED' AND amount > 0) OR 
        (amount_type = 'VARIABLE' AND amount IS NULL)
    ),
    currency CHAR(3) NOT NULL DEFAULT 'COP',
    
    -- Auto-generation configuration
    auto_generate BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Payer (user or contact - exactly one required)
    payer_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    payer_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (payer_user_id IS NOT NULL AND payer_contact_id IS NULL) OR 
        (payer_user_id IS NULL AND payer_contact_id IS NOT NULL)
    ),
    
    -- Counterparty (only for DEBT_PAYMENT type)
    counterparty_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    counterparty_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (type = 'DEBT_PAYMENT' AND (
            (counterparty_user_id IS NOT NULL AND counterparty_contact_id IS NULL) OR 
            (counterparty_user_id IS NULL AND counterparty_contact_id IS NOT NULL)
        )) OR
        (type != 'DEBT_PAYMENT' AND counterparty_user_id IS NULL AND counterparty_contact_id IS NULL)
    ),
    
    -- Payment method
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE RESTRICT,
    
    -- Recurrence settings (only for auto_generate=true)
    recurrence_pattern recurrence_pattern,
    day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 31), -- For MONTHLY
    month_of_year INT CHECK (month_of_year >= 1 AND month_of_year <= 12), -- For YEARLY
    day_of_year INT CHECK (day_of_year >= 1 AND day_of_year <= 31), -- For YEARLY (day within month)
    
    -- Schedule tracking (only for auto_generate=true)
    start_date DATE, -- When to start generating movements
    last_generated_date DATE, -- Last time a movement was generated
    next_scheduled_date DATE, -- Next scheduled generation date
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(household_id, name),
    CHECK (name != ''),
    
    -- Auto-generation validation
    CHECK (
        -- If auto_generate=true, must have recurrence pattern and start_date
        (auto_generate = TRUE AND recurrence_pattern IS NOT NULL AND start_date IS NOT NULL) OR
        (auto_generate = FALSE)
    ),
    CHECK (
        -- VARIABLE amount types never auto-generate
        (amount_type = 'VARIABLE' AND auto_generate = FALSE) OR
        (amount_type = 'FIXED')
    ),
    -- Recurrence pattern validation (only checked if auto_generate=true)
    CHECK (
        auto_generate = FALSE OR
        (recurrence_pattern = 'MONTHLY' AND day_of_month IS NOT NULL AND month_of_year IS NULL AND day_of_year IS NULL) OR
        (recurrence_pattern = 'YEARLY' AND day_of_month IS NULL AND month_of_year IS NOT NULL AND day_of_year IS NOT NULL) OR
        (recurrence_pattern = 'ONE_TIME' AND day_of_month IS NULL AND month_of_year IS NULL AND day_of_year IS NULL)
    )
);

-- Indexes
CREATE INDEX idx_recurring_templates_household ON recurring_movement_templates(household_id);
CREATE INDEX idx_recurring_templates_household_active ON recurring_movement_templates(household_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_recurring_templates_category ON recurring_movement_templates(category_id);
CREATE INDEX idx_recurring_templates_next_scheduled ON recurring_movement_templates(next_scheduled_date) WHERE is_active = TRUE AND auto_generate = TRUE;
CREATE INDEX idx_recurring_templates_household_category ON recurring_movement_templates(household_id, category_id) WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE recurring_movement_templates IS 'Templates for recurring movements (gastos periódicos). Can auto-generate movements on schedule AND/OR provide dropdown pre-fill templates.';
COMMENT ON COLUMN recurring_movement_templates.name IS 'Template name shown in UI dropdown (e.g., "Arriendo", "Servicios (Energía)")';
COMMENT ON COLUMN recurring_movement_templates.amount_type IS 'FIXED = has fixed amount, VARIABLE = user must enter amount each time';
COMMENT ON COLUMN recurring_movement_templates.auto_generate IS 'If true, automatically creates movements on schedule. If false, only appears in dropdown for manual pre-fill.';
COMMENT ON COLUMN recurring_movement_templates.recurrence_pattern IS 'How often to auto-generate (only if auto_generate=true): MONTHLY, YEARLY, ONE_TIME';
COMMENT ON COLUMN recurring_movement_templates.day_of_month IS 'Day of month for MONTHLY recurrence (1-31)';
COMMENT ON COLUMN recurring_movement_templates.month_of_year IS 'Month for YEARLY recurrence (1-12)';
COMMENT ON COLUMN recurring_movement_templates.day_of_year IS 'Day within month for YEARLY recurrence (1-31)';
COMMENT ON COLUMN recurring_movement_templates.start_date IS 'Date to start auto-generating movements (only if auto_generate=true)';
COMMENT ON COLUMN recurring_movement_templates.last_generated_date IS 'Last date a movement was auto-generated (only if auto_generate=true)';
COMMENT ON COLUMN recurring_movement_templates.next_scheduled_date IS 'Next scheduled auto-generation date (only if auto_generate=true)';
```

**Business rules:**

- **Household-specific**: Each household has its own templates
- **Unique names**: Template names must be unique within a household
- **Active/Inactive**: Inactive templates don't generate movements or appear in dropdowns
- **Dual purpose**: Templates can auto-generate AND appear in dropdown (controlled by `auto_generate` flag)
- **Three template configurations**:
  - `FIXED + auto_generate=true`: Auto-creates movements on schedule (e.g., rent on 1st of month)
  - `FIXED + auto_generate=false`: Only appears in dropdown for manual pre-fill (e.g., annual insurance)
  - `VARIABLE + auto_generate=false`: Dropdown template, user must enter amount (e.g., electricity bill)
- **Recurrence patterns** (only for auto_generate=true):
  - `MONTHLY`: Generates on specific day each month (e.g., 1st, 15th)
  - `YEARLY`: Generates on specific date each year (e.g., Jan 1, Dec 25)
  - `ONE_TIME`: Generates once on start_date (for testing or one-off scheduled expenses)
- **Role inversion**: Template with type=SPLIT can pre-fill DEBT_PAYMENT forms by inverting payer/counterparty
- **Next scheduled date**: Only for auto_generate=true, calculated after each generation
- **No end date**: Templates run forever until deactivated

---

### Migration 032: Add generated_from_template_id to movements

```sql
-- Add column to track which template generated this movement
ALTER TABLE movements 
ADD COLUMN generated_from_template_id UUID REFERENCES recurring_movement_templates(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX idx_movements_template ON movements(generated_from_template_id) WHERE generated_from_template_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN movements.generated_from_template_id IS 'If this movement was auto-generated from a recurring template, stores the template ID';
```

**Business rules:**

- Manually created movements: `generated_from_template_id = NULL`
- Auto-generated movements: `generated_from_template_id = <template_id>`
- If template is deleted: `ON DELETE SET NULL` preserves movements but unlinks them
- Used for:
  - Showing "auto-generated" badge in UI
  - Edit/delete options (this instance, all instances, future instances)
  - Tracking template usage

---

### Migration 033: Create recurring_movement_participants table

For SPLIT type recurring movements, we need to store participant percentages.

```sql
-- Create recurring_movement_participants table
CREATE TABLE recurring_movement_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES recurring_movement_templates(id) ON DELETE CASCADE,
    
    -- Participant (user or contact - exactly one required)
    participant_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    participant_contact_id UUID REFERENCES contacts(id) ON DELETE RESTRICT,
    CHECK (
        (participant_user_id IS NOT NULL AND participant_contact_id IS NULL) OR 
        (participant_user_id IS NULL AND participant_contact_id IS NOT NULL)
    ),
    
    -- Percentage (0.0 to 1.0, e.g., 0.25 = 25%)
    percentage DECIMAL(5, 4) NOT NULL CHECK (percentage > 0 AND percentage <= 1),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate participants
    UNIQUE(template_id, participant_user_id),
    UNIQUE(template_id, participant_contact_id)
);

-- Indexes
CREATE INDEX idx_recurring_participants_template ON recurring_movement_participants(template_id);
CREATE INDEX idx_recurring_participants_user ON recurring_movement_participants(participant_user_id) WHERE participant_user_id IS NOT NULL;
CREATE INDEX idx_recurring_participants_contact ON recurring_movement_participants(participant_contact_id) WHERE participant_contact_id IS NOT NULL;

-- Comment
COMMENT ON TABLE recurring_movement_participants IS 'Participant percentages for SPLIT type recurring movement templates';
```

**Business rules:**

- Only for SPLIT type templates
- Percentages must sum to 100% (validated in application, not DB)
- When template generates movement, creates corresponding `movement_participants` entries

---

## 🏗️ Backend Implementation

### Module Structure

```
backend/internal/recurring_movements/
├── types.go              # RecurringTemplate, Participant types, enums
├── repository.go         # PostgreSQL data access
├── service.go            # Business logic (CRUD templates)
├── generator.go          # Movement generation service
├── scheduler.go          # Scheduled job to check and generate movements
└── handlers.go           # HTTP handlers (CRUD templates)
```

### Key Types (types.go)

```go
package recurring_movements

import (
    "time"
    "github.com/google/uuid"
)

// RecurrencePattern represents how often a template recurs
type RecurrencePattern string

const (
    RecurrenceMonthly RecurrencePattern = "MONTHLY"
    RecurrenceYearly  RecurrencePattern = "YEARLY"
    RecurrenceOneTime RecurrencePattern = "ONE_TIME"
)

// AmountType represents whether amount is fixed or variable
type AmountType string

const (
    AmountFixed    AmountType = "FIXED"
    AmountVariable AmountType = "VARIABLE"
)

// RecurringMovementTemplate represents a template for recurring movements
type RecurringMovementTemplate struct {
    ID          uuid.UUID `json:"id"`
    HouseholdID uuid.UUID `json:"household_id"`
    
    // Template metadata
    Name        string `json:"name"`
    Description *string `json:"description,omitempty"`
    IsActive    bool   `json:"is_active"`
    
    // Movement data
    Type       movements.MovementType `json:"type"`
    CategoryID uuid.UUID              `json:"category_id"`
    
    // Amount
    AmountType AmountType      `json:"amount_type"`
    Amount     *decimal.Decimal `json:"amount,omitempty"` // NULL for VARIABLE
    Currency   string          `json:"currency"`
    
    // Auto-generation
    AutoGenerate bool `json:"auto_generate"`
    
    // Payer (one of these)
    PayerUserID    *uuid.UUID `json:"payer_user_id,omitempty"`
    PayerContactID *uuid.UUID `json:"payer_contact_id,omitempty"`
    
    // Counterparty (for DEBT_PAYMENT only)
    CounterpartyUserID    *uuid.UUID `json:"counterparty_user_id,omitempty"`
    CounterpartyContactID *uuid.UUID `json:"counterparty_contact_id,omitempty"`
    
    // Payment method
    PaymentMethodID *uuid.UUID `json:"payment_method_id,omitempty"`
    
    // Recurrence settings (only if AutoGenerate=true)
    RecurrencePattern RecurrencePattern `json:"recurrence_pattern,omitempty"`
    DayOfMonth        *int              `json:"day_of_month,omitempty"`        // 1-31 for MONTHLY
    MonthOfYear       *int              `json:"month_of_year,omitempty"`       // 1-12 for YEARLY
    DayOfYear         *int              `json:"day_of_year,omitempty"`         // 1-31 for YEARLY
    
    // Schedule tracking (only if AutoGenerate=true)
    StartDate          *time.Time `json:"start_date,omitempty"`
    LastGeneratedDate  *time.Time `json:"last_generated_date,omitempty"`
    NextScheduledDate  *time.Time `json:"next_scheduled_date,omitempty"`
    
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
    
    // Participants (for SPLIT type)
    Participants []RecurringParticipant `json:"participants,omitempty"`
}

// RecurringParticipant represents a participant in a SPLIT recurring template
type RecurringParticipant struct {
    ID                 uuid.UUID  `json:"id"`
    TemplateID         uuid.UUID  `json:"template_id"`
    ParticipantUserID    *uuid.UUID `json:"participant_user_id,omitempty"`
    ParticipantContactID *uuid.UUID `json:"participant_contact_id,omitempty"`
    Percentage         decimal.Decimal `json:"percentage"` // 0.0 to 1.0
    CreatedAt          time.Time  `json:"created_at"`
}

// UpdateScope represents what instances to update/delete
type UpdateScope string

const (
    UpdateThisInstance   UpdateScope = "THIS"      // Only this movement
    UpdateAllInstances   UpdateScope = "ALL"       // All past and future movements
    UpdateFutureInstances UpdateScope = "FUTURE"   // This and all future movements
)
```

### Service Layer (service.go)

Key methods:

```go
type Service interface {
    // Template CRUD
    CreateTemplate(ctx context.Context, householdID uuid.UUID, req CreateTemplateRequest) (*RecurringMovementTemplate, error)
    GetTemplate(ctx context.Context, householdID uuid.UUID, templateID uuid.UUID) (*RecurringMovementTemplate, error)
    ListTemplates(ctx context.Context, householdID uuid.UUID, filters ListTemplateFilters) ([]RecurringMovementTemplate, error)
    UpdateTemplate(ctx context.Context, householdID uuid.UUID, templateID uuid.UUID, req UpdateTemplateRequest) (*RecurringMovementTemplate, error)
    DeleteTemplate(ctx context.Context, householdID uuid.UUID, templateID uuid.UUID) error
    DeactivateTemplate(ctx context.Context, householdID uuid.UUID, templateID uuid.UUID) error
    
    // Instance editing (for auto-generated movements)
    UpdateMovementInstance(ctx context.Context, householdID uuid.UUID, movementID uuid.UUID, scope UpdateScope, req UpdateMovementRequest) error
    DeleteMovementInstance(ctx context.Context, householdID uuid.UUID, movementID uuid.UUID, scope UpdateScope) error
    
    // Helper methods
    GetTemplatesByCategory(ctx context.Context, householdID uuid.UUID, categoryID uuid.UUID) ([]RecurringMovementTemplate, error)
    CalculateNextScheduledDate(template *RecurringMovementTemplate) time.Time
}
```

**Business logic:**

- **CreateTemplate**: Validates data, calculates initial `next_scheduled_date`
- **UpdateTemplate**: Recalculates `next_scheduled_date` if schedule changed
- **UpdateMovementInstance**:
  - `THIS`: Update only the specific movement
  - `ALL`: Update template + all generated movements
  - `FUTURE`: Update template + movements with date >= today
- **DeleteMovementInstance**:
  - `THIS`: Delete only the specific movement
  - `ALL`: Delete template + all generated movements
  - `FUTURE`: Delete template (deactivate) + movements with date >= today

---

### Generator Service (generator.go)

Responsible for creating movements from templates.

```go
type Generator interface {
    // Generate movements from templates that are due
    GenerateDueMovements(ctx context.Context) (int, error)
    
    // Generate movement from a specific template (for manual trigger)
    GenerateFromTemplate(ctx context.Context, templateID uuid.UUID, forDate time.Time) (uuid.UUID, error)
    
    // Calculate next occurrence date
    CalculateNextOccurrence(template *RecurringMovementTemplate, afterDate time.Time) time.Time
}
```

**Generation algorithm:**

```go
func (g *generator) GenerateDueMovements(ctx context.Context) (int, error) {
    // 1. Get all active templates where auto_generate=true AND next_scheduled_date <= today
    templates, err := g.repo.GetDueTemplates(ctx, time.Now())
    if err != nil {
        return 0, err
    }
    
    generated := 0
    for _, template := range templates {
        // 2. Create movement from template
        movement, err := g.createMovementFromTemplate(ctx, template, template.NextScheduledDate)
        if err != nil {
            log.Errorf("Failed to generate movement from template %s: %v", template.ID, err)
            continue
        }
        
        // 3. Update template's last_generated_date and next_scheduled_date
        nextDate := g.CalculateNextOccurrence(template, *template.NextScheduledDate)
        err = g.repo.UpdateGenerationTracking(ctx, template.ID, *template.NextScheduledDate, nextDate)
        if err != nil {
            log.Errorf("Failed to update template %s tracking: %v", template.ID, err)
            // Continue anyway - movement was created successfully
        }
        
        generated++
    }
    
    return generated, nil
}

func (g *generator) CalculateNextOccurrence(template *RecurringMovementTemplate, afterDate time.Time) time.Time {
    switch template.RecurrencePattern {
    case RecurrenceMonthly:
        // Add 1 month, keeping the same day
        nextMonth := afterDate.AddDate(0, 1, 0)
        
        // Handle edge cases (e.g., Jan 31 → Feb 28/29)
        if template.DayOfMonth != nil {
            year, month, _ := nextMonth.Date()
            day := min(*template.DayOfMonth, daysInMonth(year, month))
            return time.Date(year, month, day, 0, 0, 0, 0, afterDate.Location())
        }
        return nextMonth
        
    case RecurrenceYearly:
        // Add 1 year, same month and day
        nextYear := afterDate.AddDate(1, 0, 0)
        year := nextYear.Year()
        month := time.Month(*template.MonthOfYear)
        day := min(*template.DayOfYear, daysInMonth(year, month))
        return time.Date(year, month, day, 0, 0, 0, 0, afterDate.Location())
        
    case RecurrenceOneTime:
        // No next occurrence for one-time templates
        return time.Time{} // Zero value = no next occurrence
        
    default:
        return time.Time{}
    }
}
```

---

### Scheduler (scheduler.go)

Runs as a background service to periodically check and generate movements.

```go
type Scheduler struct {
    generator Generator
    interval  time.Duration
    quit      chan bool
}

func NewScheduler(generator Generator, interval time.Duration) *Scheduler {
    return &Scheduler{
        generator: generator,
        interval:  interval,
        quit:      make(chan bool),
    }
}

func (s *Scheduler) Start() {
    ticker := time.NewTicker(s.interval)
    go func() {
        for {
            select {
            case <-ticker.C:
                count, err := s.generator.GenerateDueMovements(context.Background())
                if err != nil {
                    log.Errorf("Failed to generate movements: %v", err)
                } else if count > 0 {
                    log.Infof("Generated %d movements from templates", count)
                }
            case <-s.quit:
                ticker.Stop()
                return
            }
        }
    }()
}

func (s *Scheduler) Stop() {
    s.quit <- true
}
```

**Deployment:**

- Run scheduler in main application (not separate service)
- Check every 12 hours (templates only specify day, not hour)
- On startup, run immediate check (catch up on missed generations)
- Manual trigger available via POST /api/recurring-movements/generate endpoint

**Edge cases:**

- **Server down during scheduled time**: Next run will catch up (generates for all missed dates)
- **Duplicate generation prevention**: Check if movement already exists for (template_id, date)
- **Template edited mid-month**: Next generation uses new values
- **Time zones**: Use household's timezone (stored in households table) or default to UTC

---

## 🎨 Frontend Implementation

### UI Changes

#### 1. Movement Creation Form (All Movement Types)

**Current flow:**
1. User selects: Type (HOUSEHOLD/SPLIT/DEBT_PAYMENT)
2. User fills: Date, Category, Amount, Payer, Payment Method, Description

**New flow with recurring movements:**
1. User selects: **Type** (HOUSEHOLD/SPLIT/DEBT_PAYMENT)
2. User selects: **Category** ← triggers category selection
3. **NEW**: If category has active recurring templates:
   - Show dropdown: "¿Cuál gasto periódico?" (optional)
   - Options: List of template names (e.g., "Arriendo", "Servicios (Energía)", "Internet")
   - Empty option: "Ninguno (nuevo gasto)"
4. If template selected:
   - Check if movement type matches template type:
     - **Same type**: Pre-fill form using template data as-is
     - **DEBT_PAYMENT from SPLIT template**: Pre-fill with inverted roles (payer ↔ counterparty)
   - **FIXED amount**: Pre-fill amount field
   - **VARIABLE amount**: Leave amount empty (user must enter)
5. User can modify any pre-filled values
6. Save creates regular movement (linked to template via `generated_from_template_id` only if auto-generated)

**HTML mockup:**

```html
<!-- Movement type selection -->
<div class="form-group">
  <label>Tipo de movimiento</label>
  <select id="movement-type" class="form-control">
    <option value="HOUSEHOLD">Gasto familiar</option>
    <option value="SPLIT">Gasto compartido</option>
    <option value="DEBT_PAYMENT">Pago de deuda</option>
  </select>
</div>

<!-- Category selection -->
<div class="form-group">
  <label>Categoría</label>
  <select id="category" class="form-control">
    <option value="">Seleccionar...</option>
    <option value="gastos-fijos-uuid">Gastos fijos</option>
    <option value="mercado-uuid">Mercado</option>
  </select>
</div>

<!-- Recurring template selector (appears if category has templates) -->
<div class="form-group" id="recurring-template-selector" style="display: none;">
  <label>¿Cuál gasto periódico? (opcional)</label>
  <select id="recurring-template" class="form-control">
    <option value="">Ninguno (nuevo gasto)</option>
    <option value="template-uuid-1" data-template-type="SPLIT" data-amount-type="FIXED">Arriendo</option>
    <option value="template-uuid-2" data-template-type="SPLIT" data-amount-type="VARIABLE">Servicios (Energía)</option>
    <option value="template-uuid-3" data-template-type="HOUSEHOLD" data-amount-type="FIXED">Internet</option>
  </select>
  <small class="form-hint">Pre-llena el formulario con datos del gasto periódico</small>
</div>

<!-- Existing fields (pre-filled if template selected) -->
<div class="form-group">
  <label>Valor</label>
  <input type="number" id="amount" class="form-control" />
</div>
...
```

**JavaScript logic:**

```javascript
// When category changes
document.getElementById('category').addEventListener('change', async (e) => {
  const categoryId = e.target.value;
  
  if (!categoryId) {
    document.getElementById('recurring-template-selector').style.display = 'none';
    return;
  }
  
  // Fetch templates for this category
  const templates = await fetchRecurringTemplates(categoryId);
  
  if (templates.length > 0) {
    // Show template selector
    populateTemplateDropdown(templates);
    document.getElementById('recurring-template-selector').style.display = 'block';
  } else {
    // Hide template selector
    document.getElementById('recurring-template-selector').style.display = 'none';
  }
});

// When template selected
document.getElementById('recurring-template').addEventListener('change', async (e) => {
  const templateId = e.target.value;
  
  if (!templateId) {
    // "Ninguno" selected - clear form
    clearFormExceptTypeAndCategory();
    return;
  }
  
  const template = await fetchTemplateById(templateId);
  const movementType = document.getElementById('movement-type').value;
  
  // Pre-fill form based on movement type
  if (movementType === template.type) {
    // Same type: use template data as-is
    preFillFormDirect(template);
  } else if (movementType === 'DEBT_PAYMENT' && template.type === 'SPLIT') {
    // Creating debt payment from split template: invert roles
    preFillFormInverted(template);
  } else {
    // Other combinations: best effort mapping
    preFillFormBestEffort(template);
  }
});

function preFillFormDirect(template) {
  // Direct mapping (e.g., SPLIT template → SPLIT movement)
  document.getElementById('description').value = template.name;
  
  if (template.amount_type === 'FIXED') {
    document.getElementById('amount').value = template.amount;
  } else {
    document.getElementById('amount').value = '';
    document.getElementById('amount').focus();
  }
  
  // Payer
  if (template.payer_user_id) {
    document.getElementById('payer-type').value = 'user';
    document.getElementById('payer').value = template.payer_user_id;
  } else {
    document.getElementById('payer-type').value = 'contact';
    document.getElementById('payer').value = template.payer_contact_id;
  }
  
  // Payment method
  if (template.payment_method_id) {
    document.getElementById('payment-method').value = template.payment_method_id;
  }
  
  // Participants (for SPLIT)
  if (template.type === 'SPLIT' && template.participants) {
    populateParticipants(template.participants);
  }
}

function preFillFormInverted(template) {
  // Invert roles for DEBT_PAYMENT from SPLIT template
  document.getElementById('description').value = `Pago: ${template.name}`;
  
  if (template.amount_type === 'FIXED') {
    document.getElementById('amount').value = template.amount;
  } else {
    document.getElementById('amount').value = '';
    document.getElementById('amount').focus();
  }
  
  // Template payer → counterparty
  if (template.payer_user_id) {
    document.getElementById('counterparty-type').value = 'user';
    document.getElementById('counterparty').value = template.payer_user_id;
  } else {
    document.getElementById('counterparty-type').value = 'contact';
    document.getElementById('counterparty').value = template.payer_contact_id;
  }
  
  // Template first participant → payer
  if (template.participants && template.participants.length > 0) {
    const firstParticipant = template.participants[0];
    if (firstParticipant.participant_user_id) {
      document.getElementById('payer-type').value = 'user';
      document.getElementById('payer').value = firstParticipant.participant_user_id;
    } else {
      document.getElementById('payer-type').value = 'contact';
      document.getElementById('payer').value = firstParticipant.participant_contact_id;
    }
  }
  
  // Payment method (from template)
  if (template.payment_method_id) {
    document.getElementById('payment-method').value = template.payment_method_id;
  }
}
```

---

#### 2. Movement List (Gastos View)

**Visual indicator for auto-generated movements:**

Add a small badge/icon to show movement was auto-generated.

```html
<div class="movement-detail-entry">
  <div class="entry-info">
    <span class="entry-description">
      Arriendo
      <span class="auto-generated-badge" title="Generado automáticamente">🔁</span>
    </span>
    <span class="entry-amount">$3.200.000</span>
    <div class="entry-date">1 Ene 2026</div>
  </div>
  <div class="entry-actions">
    <button class="three-dots-btn" data-movement-id="...">⋮</button>
    <div class="three-dots-menu" id="movement-menu-...">
      <button class="menu-item" data-action="edit">Editar</button>
      <button class="menu-item" data-action="delete">Eliminar</button>
    </div>
  </div>
</div>
```

**CSS:**

```css
.auto-generated-badge {
  display: inline-block;
  font-size: 12px;
  margin-left: 6px;
  opacity: 0.6;
}
```

---

#### 3. Edit/Delete Modal for Auto-Generated Movements

When user clicks edit/delete on an auto-generated movement, show options:

**Edit Modal:**

```html
<div class="modal" id="edit-recurring-modal">
  <div class="modal-content">
    <h3>Editar gasto fijo</h3>
    <p>Este gasto fue generado automáticamente. ¿Qué deseas editar?</p>
    
    <button class="btn-primary" data-scope="THIS">
      Solo esta vez (1 Ene 2026)
    </button>
    <button class="btn-secondary" data-scope="FUTURE">
      Esta y futuras ocurrencias
    </button>
    <button class="btn-secondary" data-scope="ALL">
      Todas las ocurrencias
    </button>
    
    <button class="btn-cancel">Cancelar</button>
  </div>
</div>
```

**Delete Modal:**

```html
<div class="modal" id="delete-recurring-modal">
  <div class="modal-content">
    <h3>Eliminar gasto fijo</h3>
    <p>Este gasto fue generado automáticamente. ¿Qué deseas eliminar?</p>
    
    <button class="btn-danger" data-scope="THIS">
      Solo esta vez (1 Ene 2026)
    </button>
    <button class="btn-danger" data-scope="FUTURE">
      Esta y futuras ocurrencias
    </button>
    <button class="btn-danger" data-scope="ALL">
      Todas las ocurrencias
    </button>
    
    <button class="btn-cancel">Cancelar</button>
  </div>
</div>
```

**JavaScript:**

```javascript
async function handleEditMovement(movementId) {
  const movement = await fetchMovement(movementId);
  
  if (movement.generated_from_template_id) {
    // Auto-generated - show scope selector
    const scope = await showEditScopeModal(movement);
    
    if (scope) {
      await updateMovement(movementId, scope, editedData);
    }
  } else {
    // Regular movement - edit directly
    await updateMovement(movementId, 'THIS', editedData);
  }
}

async function handleDeleteMovement(movementId) {
  const movement = await fetchMovement(movementId);
  
  if (movement.generated_from_template_id) {
    // Auto-generated - show scope selector
    const scope = await showDeleteScopeModal(movement);
    
    if (scope && confirm(`¿Estás seguro?`)) {
      await deleteMovement(movementId, scope);
    }
  } else {
    // Regular movement - delete directly
    if (confirm('¿Eliminar este gasto?')) {
      await deleteMovement(movementId, 'THIS');
    }
  }
}
```

---

#### 4. Template Management (Future - Manual DB for Now)

**Future UI** (not in Phase 8, will be in /hogar page):

- List all recurring templates
- Create new template
- Edit existing template
- Deactivate/reactivate template
- View history of generated movements

**For now:**
- Jose and Caro add templates directly to DB
- Example SQL:

```sql
-- Create monthly rent template (FIXED amount)
INSERT INTO recurring_movement_templates (
  household_id,
  name,
  type,
  category_id,
  amount_type,
  amount,
  payer_contact_id,
  recurrence_pattern,
  day_of_month,
  start_date,
  next_scheduled_date
) VALUES (
  '<jose-caro-household-id>',
  'Arriendo',
  'DEBT_PAYMENT',
  '<gastos-fijos-category-id>',
  'FIXED',
  3200000,
  '<landlord-contact-id>',
  'MONTHLY',
  1, -- First day of month
  '2026-02-01',
  '2026-02-01'
);

-- Create variable utility bill template
INSERT INTO recurring_movement_templates (
  household_id,
  name,
  type,
  category_id,
  amount_type,
  amount,
  payer_user_id,
  payment_method_id,
  recurrence_pattern,
  day_of_month,
  start_date
) VALUES (
  '<jose-caro-household-id>',
  'Servicios',
  'HOUSEHOLD',
  '<gastos-fijos-category-id>',
  'VARIABLE',
  NULL, -- Variable amount
  '<jose-user-id>',
  '<payment-method-id>',
  'MONTHLY',
  1,
  '2026-02-01'
);
```

---

## 🔄 API Specification

### Endpoints

#### GET /api/recurring-movements

List recurring templates for a household.

**Request:**
```
GET /api/recurring-movements?category_id=<uuid>&amount_type=FIXED&auto_generate=true&is_active=true
Authorization: Bearer <token>
```

**Query params:**
- `category_id` (optional): Filter by category
- `amount_type` (optional): Filter by FIXED or VARIABLE
- `auto_generate` (optional): Filter by auto-generation enabled
- `is_active` (optional): Filter by active status (default: true)

**Response:**
```json
{
  "templates": [
    {
      "id": "uuid",
      "household_id": "uuid",
      "name": "Arriendo",
      "description": "Renta mensual apartamento",
      "is_active": true,
      "type": "SPLIT",
      "category_id": "uuid",
      "amount_type": "FIXED",
      "amount": 3200000,
      "currency": "COP",
      "auto_generate": true,
      "payer_contact_id": "arrendamientos-la-99-uuid",
      "participants": [
        {
          "participant_user_id": "jose-uuid",
          "percentage": 1.0
        }
      ],
      "payment_method_id": null,
      "recurrence_pattern": "MONTHLY",
      "day_of_month": 1,
      "start_date": "2026-02-01",
      "last_generated_date": "2026-02-01",
      "next_scheduled_date": "2026-03-01",
      "created_at": "2026-01-19T12:00:00Z",
      "updated_at": "2026-02-01T06:00:00Z"
    },
    {
      "id": "uuid",
      "name": "Servicios (Energía)",
      "type": "SPLIT",
      "amount_type": "VARIABLE",
      "amount": null,
      "auto_generate": false,
      "payer_contact_id": "epm-uuid",
      "participants": [
        {
          "participant_user_id": "jose-uuid",
          "percentage": 1.0
        }
      ],
      ...
    }
  ]
}
```

---

#### POST /api/recurring-movements

Create a new recurring template.

**Request:**
```json
{
  "name": "Internet",
  "description": "Fibra óptica 300 Mbps",
  "type": "HOUSEHOLD",
  "category_id": "uuid",
  "amount_type": "FIXED",
  "amount": 85000,
  "auto_generate": true,
  "payer_user_id": "uuid",
  "payment_method_id": "uuid",
  "recurrence_pattern": "MONTHLY",
  "day_of_month": 5,
  "start_date": "2026-02-05"
}
```

**Response:**
```json
{
  "template": { ... }
}
```

---

#### PUT /api/recurring-movements/:id

Update a recurring template.

**Request:**
```json
{
  "amount": 90000,
  "day_of_month": 10
}
```

**Response:**
```json
{
  "template": { ... }
}
```

**Side effects:**
- Recalculates `next_scheduled_date`
- Does NOT affect already-generated movements

---

#### DELETE /api/recurring-movements/:id

Delete (deactivate) a recurring template.

**Request:**
```
DELETE /api/recurring-movements/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Template deactivated"
}
```

**Side effects:**
- Sets `is_active = false`
- Stops future movement generation
- Does NOT delete already-generated movements

---

#### PUT /api/movements/:id/update-instance

Update a movement instance (for auto-generated movements).

**Request:**
```json
{
  "scope": "FUTURE",
  "amount": 3300000,
  "description": "Arriendo (aumentó $100k)"
}
```

**Scope values:**
- `THIS`: Update only this movement
- `FUTURE`: Update template + movements with date >= today
- `ALL`: Update template + all generated movements

**Response:**
```json
{
  "updated_count": 12,
  "message": "Updated template and 12 future movements"
}
```

---

#### DELETE /api/movements/:id/delete-instance

Delete a movement instance (for auto-generated movements).

**Request:**
```
DELETE /api/movements/:id/delete-instance?scope=FUTURE
Authorization: Bearer <token>
```

**Scope values:** Same as update

**Response:**
```json
{
  "deleted_count": 12,
  "message": "Deactivated template and deleted 12 future movements"
}
```

---

#### POST /api/recurring-movements/generate

Manually trigger the scheduler to process all pending templates. Useful for testing or forcing generation without waiting for the next scheduled run (12 hours).

**Request:**
```bash
POST /api/recurring-movements/generate
# No body required
```

**Response:**
```json
{
  "success": true,
  "message": "Pending templates processed successfully"
}
```

**Behavior:**
- Processes all templates with `auto_generate=true` and `next_scheduled_date <= now()`
- Same logic as automatic scheduler
- Logs number of templates processed
- Returns success even if no templates were pending

---

## 📦 Migration Strategy

### Phase 1: Category Foreign Key Migration

**Goal:** Change `movements.category` from VARCHAR to `category_id` UUID.

**Steps:**

1. **Create migration 030:**
   ```sql
   ALTER TABLE movements ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE RESTRICT;
   CREATE INDEX idx_movements_category ON movements(category_id) WHERE category_id IS NOT NULL;
   ```

2. **Create data migration script:**
   ```sql
   -- backend/scripts/migrate_category_names_to_ids.sql
   
   -- Map category names to IDs for Jose & Caro's household
   UPDATE movements m
   SET category_id = c.id
   FROM categories c
   WHERE m.household_id = c.household_id
     AND m.category = c.name
     AND m.category_id IS NULL;
   
   -- Verify migration
   SELECT 
     COUNT(*) as total_movements,
     COUNT(category_id) as with_category_id,
     COUNT(*) - COUNT(category_id) as missing_category_id
   FROM movements;
   ```

3. **Update backend:**
   - Update `movements.types.go` to use `CategoryID uuid.UUID`
   - Update all queries to use `category_id`
   - Keep `category` column for backward compatibility (deprecate later)

4. **Update frontend:**
   - Send `category_id` instead of `category` name
   - Update movement display to fetch category name from categories table

5. **Validate:**
   - All movements have `category_id` populated
   - No broken foreign key references
   - Frontend displays categories correctly

---

### Phase 2: Recurring Templates Implementation

**Goal:** Create tables and backend services.

**Steps:**

1. **Run migrations 031-033:**
   - Create `recurring_movement_templates` table
   - Add `generated_from_template_id` to movements
   - Create `recurring_movement_participants` table

2. **Implement backend:**
   - `internal/recurring_movements` package
   - Repository, Service, Generator, Scheduler
   - HTTP handlers
   - Tests

3. **Add templates for Jose & Caro:**
   ```sql
   -- Insert initial templates manually
   -- (Examples shown earlier in "Template Management" section)
   ```

4. **Start scheduler:**
   - Add to `main.go`
   - Run on startup
   - Check every 12 hours
   - Manual trigger via POST /api/recurring-movements/generate

5. **Validate:**
   - Templates created successfully
   - Generator creates movements on schedule
   - Movements have correct `generated_from_template_id`

---

### Phase 3: Frontend Integration

**Goal:** Add UI for selecting templates when creating movements.

**Steps:**

1. **Update movement form:**
   - Add template dropdown (shown when category selected)
   - Pre-fill form when template selected
   - Handle FIXED vs VARIABLE types

2. **Update movement list:**
   - Show auto-generated badge
   - Edit/Delete modals with scope selection

3. **Add API calls:**
   - Fetch templates by category
   - Update/delete with scope

4. **Validate:**
   - User can create movements from templates
   - FIXED templates pre-fill amount
   - VARIABLE templates require manual amount
   - Edit/delete scopes work correctly

---

### Phase 4: Testing & Monitoring

**Goal:** Ensure system is reliable and observable.

**Steps:**

1. **Add tests:**
   - Unit tests for generator logic
   - Integration tests for template CRUD
   - E2E tests for movement creation

2. **Add logging:**
   - Log when movements are generated
   - Log template creation/updates
   - Log scheduler runs

3. **Add monitoring:**
   - Count of templates per household
   - Count of movements generated per day
   - Failed generation attempts

4. **Validate:**
   - All tests pass
   - Logs show expected behavior
   - No errors in production

---

## 🧪 Testing Strategy

### Unit Tests

**Generator logic:**
- `CalculateNextOccurrence()` for MONTHLY, YEARLY, ONE_TIME
- Edge cases: Feb 29, day 31 in month with 30 days
- Timezone handling

**Template validation:**
- Amount type validation (FIXED requires amount, VARIABLE does not)
- Recurrence pattern validation (MONTHLY requires day_of_month)
- Participant percentage sum = 100%

### Integration Tests

**Template CRUD:**
- Create template with valid data
- Create template with invalid data (expect error)
- Update template recalculates next_scheduled_date
- Delete template deactivates (does not hard delete)

**Movement generation:**
- Generate from template creates movement with correct data
- Generated movement has `generated_from_template_id` set
- Template's `last_generated_date` and `next_scheduled_date` updated
- Duplicate generation prevention (idempotency)

**Instance editing:**
- Update THIS scope updates only one movement
- Update FUTURE scope updates template + future movements
- Update ALL scope updates template + all movements
- Delete scopes work similarly

### E2E Tests

**User flow:**
1. Create recurring template (FIXED amount, monthly)
2. Wait for scheduler to generate movement (or trigger manually)
3. Verify movement appears in Gastos view with auto-generated badge
4. Edit movement with FUTURE scope
5. Verify template and future movements updated
6. Delete movement with ALL scope
7. Verify template deactivated and all movements deleted

**Variable amount flow:**
1. Create recurring template (VARIABLE amount)
2. Verify it does NOT auto-generate movement
3. Create movement, select category
4. Verify template appears in dropdown
5. Select template
6. Verify form pre-fills except amount
7. Enter amount and save
8. Verify movement created (NOT linked to template)

---

## 🔮 Future Enhancements

### Phase 9: Template Management UI

**Goal:** Allow users to manage templates from /hogar page.

**Features:**
- List all templates (grouped by category)
- Create new template (form similar to movement form + recurrence settings)
- Edit template (with preview of affected future movements)
- View history of generated movements
- Pause/resume template (temporarily disable without deleting)

---

### Phase 10: Notifications

**Goal:** Notify users when movements are auto-generated.

**Features:**
- In-app notification: "Se generó Arriendo ($3.2M) para 1 Feb"
- Email notification (optional, user preference)
- Summary notification: "Se generaron 5 gastos fijos hoy"

---

### Phase 11: Smart Templates

**Goal:** Handle variable amounts more intelligently.

**Features:**
- Last-value tracking: Pre-fill with last month's amount
- Average calculation: Suggest average of last 3 months
- Manual approval: Auto-create draft, user reviews and approves
- OCR integration: Scan bill photo, extract amount

---

### Phase 12: Shared Recurring Expenses

**Goal:** Support SPLIT type recurring movements.

**Features:**
- Template defines participants and percentages
- Auto-generated movement creates `movement_participants` entries
- Cross-family synchronization (for external contacts)

---

## 📝 Summary

This phase introduces **Recurring Movements (Gastos Fijos)** to automate repetitive expenses and debts.

**Key capabilities:**
- Templates for recurring movements (rent, subscriptions, utilities)
- Two types: FIXED (auto-create) and VARIABLE (dropdown template)
- Flexible recurrence: monthly, yearly, custom day
- Instance editing: THIS, FUTURE, ALL scopes
- PostgreSQL only (no Google Sheets dual-write)

**Timeline estimate:**
- Migration 030 (category FK): 1 day
- Migrations 031-033 (recurring tables): 1 day
- Backend implementation: 3-4 days
- Frontend integration: 2-3 days
- Testing & validation: 2 days
- **Total: ~10 days**

**Dependencies:**
- Categories already in database (migration 018) ✅
- Movements table exists (migration 016) ✅
- Manual template creation (management UI is future work)

**Risks:**
- Scheduler reliability (must run consistently)
- Time zone handling (use household timezone)
- Edge cases (Feb 29, day 31 rollover)

**Mitigation:**
- Extensive unit tests for date calculations
- Idempotency in generator (prevent duplicates)
- Manual trigger endpoint for debugging
- Logging and monitoring for observability

---

## 📖 Complete Examples

### Example 1: Rent (Auto-Generate SPLIT, Pre-fill DEBT_PAYMENT)

**Template configuration:**

```json
{
  "name": "Arriendo",
  "description": "Renta mensual apartamento",
  "type": "SPLIT",
  "category_id": "gastos-fijos-uuid",
  "amount_type": "FIXED",
  "amount": 3200000,
  "auto_generate": true,
  
  "payer_contact_id": "arrendamientos-la-99-uuid",
  "participants": [
    {
      "participant_user_id": "jose-uuid",
      "percentage": 1.0
    }
  ],
  
  "recurrence_pattern": "MONTHLY",
  "day_of_month": 1,
  "start_date": "2026-02-01"
}
```

**Behavior:**

**1. Auto-generation (1st of February):**
- Scheduler creates SPLIT movement:
  ```json
  {
    "type": "SPLIT",
    "payer_contact_id": "arrendamientos-la-99-uuid",
    "participants": [{"user_id": "jose-uuid", "percentage": 1.0}],
    "amount": 3200000,
    "category_id": "gastos-fijos-uuid",
    "description": "Arriendo",
    "movement_date": "2026-02-01",
    "generated_from_template_id": "arriendo-template-uuid"
  }
  ```
- **Result**: Creates debt of Jose to Arrendamientos la 99 for $3.2M
- Movement shows in Gastos view with 🔁 badge

**2. Manual payment (user creates DEBT_PAYMENT):**
- User creates new movement
- Selects type: DEBT_PAYMENT
- Selects category: "Gastos fijos"
- Dropdown appears: "¿Cuál gasto periódico?"
- User selects: "Arriendo"
- Form pre-fills with **inverted roles**:
  ```javascript
  {
    type: 'DEBT_PAYMENT',
    payer_user_id: 'jose-uuid',  // Was participant in template
    counterparty_contact_id: 'arrendamientos-la-99-uuid',  // Was payer in template
    amount: 3200000,
    category_id: 'gastos-fijos-uuid',
    description: 'Pago: Arriendo',
    movement_date: '2026-02-05'  // User enters date
  }
  ```
- User saves → movement created (NOT linked to template, no 🔁 badge)
- **Result**: Debt payment recorded, balance updated

---

### Example 2: Utilities (Variable Amount, Manual Only)

**Template configuration:**

```json
{
  "name": "Servicios (Energía)",
  "description": "Factura mensual de energía (EPM)",
  "type": "SPLIT",
  "category_id": "gastos-fijos-uuid",
  "amount_type": "VARIABLE",
  "amount": null,
  "auto_generate": false,
  
  "payer_contact_id": "epm-uuid",
  "participants": [
    {
      "participant_user_id": "jose-uuid",
      "percentage": 1.0
    }
  ],
  
  "payment_method_id": null
}
```

**Behavior:**

**1. No auto-generation:**
- Template has `auto_generate=false`
- Scheduler ignores this template
- No movements created automatically

**2. Manual expense entry (SPLIT):**
- User creates new movement
- Selects type: SPLIT
- Selects category: "Gastos fijos"
- Dropdown appears with "Servicios (Energía)"
- User selects template
- Form pre-fills:
  ```javascript
  {
    type: 'SPLIT',
    payer_contact_id: 'epm-uuid',
    participants: [{user_id: 'jose-uuid', percentage: 1.0}],
    amount: '',  // EMPTY - user must enter
    category_id: 'gastos-fijos-uuid',
    description: 'Servicios (Energía)',
    movement_date: '2026-02-15'  // User enters
  }
  ```
- User enters amount: $245.300
- User saves → movement created
- **Result**: Debt of Jose to EPM for $245.300

**3. Manual payment entry (DEBT_PAYMENT):**
- Same flow as rent payment example
- Form pre-fills with inverted roles
- User enters amount (same as bill)
- Saves → debt payment recorded

---

### Example 3: Annual Insurance (Fixed Amount, Manual Only)

**Template configuration:**

```json
{
  "name": "Seguro del carro",
  "description": "Póliza anual SOAT",
  "type": "HOUSEHOLD",
  "category_id": "carro-uuid",
  "amount_type": "FIXED",
  "amount": 450000,
  "auto_generate": false,
  
  "payer_user_id": "jose-uuid",
  "payment_method_id": "mastercard-uuid"
}
```

**Behavior:**

**1. No auto-generation:**
- `auto_generate=false` (even though amount is FIXED)
- User creates manually when needed (once per year)

**2. Manual entry:**
- User creates HOUSEHOLD movement
- Selects category: "Carro"
- Dropdown shows "Seguro del carro"
- User selects template
- Form pre-fills including amount:
  ```javascript
  {
    type: 'HOUSEHOLD',
    payer_user_id: 'jose-uuid',
    amount: 450000,  // Pre-filled
    payment_method_id: 'mastercard-uuid',
    category_id: 'carro-uuid',
    description: 'Seguro del carro',
    movement_date: '2026-03-15'
  }
  ```
- User can adjust amount if changed
- Saves → movement created

---

### Example 4: Monthly Internet (Auto-Generate HOUSEHOLD)

**Template configuration:**

```json
{
  "name": "Internet",
  "description": "Fibra óptica 300 Mbps (Claro)",
  "type": "HOUSEHOLD",
  "category_id": "gastos-fijos-uuid",
  "amount_type": "FIXED",
  "amount": 85000,
  "auto_generate": true,
  
  "payer_user_id": "jose-uuid",
  "payment_method_id": "mastercard-uuid",
  
  "recurrence_pattern": "MONTHLY",
  "day_of_month": 5,
  "start_date": "2026-02-05"
}
```

**Behavior:**

**1. Auto-generation (5th of each month):**
- Scheduler creates HOUSEHOLD movement:
  ```json
  {
    "type": "HOUSEHOLD",
    "payer_user_id": "jose-uuid",
    "amount": 85000,
    "payment_method_id": "mastercard-uuid",
    "category_id": "gastos-fijos-uuid",
    "description": "Internet",
    "movement_date": "2026-02-05",
    "generated_from_template_id": "internet-template-uuid"
  }
  ```
- Movement shows with 🔁 badge
- **Result**: Household expense recorded automatically

**2. Manual usage:**
- User can also select "Internet" from dropdown
- Pre-fills all fields
- Useful if scheduler failed or user wants to create manually

---

## 🔄 Role Inversion Logic Summary

| Template Type | Movement Type | Payer Mapping | Counterparty/Participant Mapping |
|--------------|--------------|---------------|----------------------------------|
| SPLIT | SPLIT | Use template payer | Use template participants |
| SPLIT | DEBT_PAYMENT | Use template participant[0] | Use template payer |
| HOUSEHOLD | HOUSEHOLD | Use template payer | N/A |
| DEBT_PAYMENT | DEBT_PAYMENT | Use template payer | Use template counterparty |
| SPLIT | HOUSEHOLD | Best effort (use payer or participant) | N/A |

**Key insight**: SPLIT template is most versatile - serves both expense (SPLIT) and payment (DEBT_PAYMENT) by inverting roles.


---

## 💳 "Saldar" Feature Integration (Préstamos View)

This feature adds quick debt settlement from the Préstamos (Loans) view, with intelligent template integration.

### Two Levels of "Saldar"

#### Level 1: Settle Complete Debt (Person-to-Person)

**Location**: Three-dot menu (⋮) next to person avatar in debt summary

**Example**: "Primo Juanda debe a Caro Test - $7.782.733" → ⋮ → "Saldar deuda completa"

**Behavior:**
1. Calculate total debt between two people (sum of all unpaid movements)
2. Pre-fill DEBT_PAYMENT form
3. User can modify amount (partial payment allowed)
4. If all movements share same template → pre-fill category + select template in dropdown
5. If mixed templates or no templates → category empty (existing validation applies)

#### Level 2: Settle Individual Movement

**Location**: Three-dot menu (⋮) on individual movement entry

**Example**: Movement "Pruba - $7.782.733" → ⋮ → "Saldar"

**Behavior:**
1. Pre-fill DEBT_PAYMENT form for this specific movement
2. User can modify amount (partial payment)
3. If movement has `generated_from_template_id` → pre-fill category + select template
4. If no template → category empty (existing validation applies)

---

### Pre-Fill Logic

#### API Endpoint: GET /api/loans/debt-payment-prefill

**Request:**
```
GET /api/loans/debt-payment-prefill?movement_ids=mov1,mov2&mode=complete
Authorization: Bearer <token>
```

**Query params:**
- `movement_ids`: Comma-separated UUIDs (one or more movements to settle)
- `mode`: "individual" (single movement) or "complete" (person-to-person total)

**Response:**
```json
{
  "prefill_data": {
    "type": "DEBT_PAYMENT",
    "description": "Pago total: Primo Juanda a Caro",
    "amount": 7782733,
    "payer_user_id": null,
    "payer_contact_id": "primo-juanda-uuid",
    "counterparty_user_id": "caro-uuid",
    "counterparty_contact_id": null,
    "category_id": null,
    "template_id": null,
    "movement_date": "2026-01-19"
  },
  "original_movements": [
    {
      "id": "mov-prueba-uuid",
      "description": "Pruba",
      "amount": 7782733,
      "movement_date": "2026-01-09"
    }
  ]
}
```

**With template:**
```json
{
  "prefill_data": {
    "type": "DEBT_PAYMENT",
    "description": "Pago: Arriendo",
    "amount": 3200000,
    "payer_user_id": "jose-uuid",
    "counterparty_contact_id": "arrendamientos-la-99-uuid",
    "category_id": "gastos-fijos-uuid",
    "template_id": "arriendo-template-uuid",
    "template_name": "Arriendo",
    "movement_date": "2026-01-19"
  },
  "original_movements": [...]
}
```

**Multiple movements with same template:**
```json
{
  "prefill_data": {
    "description": "Pago total: Arriendo (Feb-Mar)",
    "amount": 6400000,
    "category_id": "gastos-fijos-uuid",
    "template_id": "arriendo-template-uuid",
    "template_name": "Arriendo",
    ...
  },
  "original_movements": [
    {"id": "...", "description": "Arriendo", "amount": 3200000, "movement_date": "2026-02-01"},
    {"id": "...", "description": "Arriendo", "amount": 3200000, "movement_date": "2026-03-01"}
  ]
}
```

---

### Backend Logic

```go
func (s *Service) GetDebtPaymentPrefill(ctx context.Context, householdID uuid.UUID, movementIDs []uuid.UUID, mode string) (*DebtPaymentPrefill, error) {
    // 1. Fetch movements
    movements, err := s.repo.GetMovementsByIDs(ctx, householdID, movementIDs)
    if err != nil {
        return nil, err
    }
    
    // 2. Calculate total amount
    totalAmount := decimal.Zero
    for _, m := range movements {
        totalAmount = totalAmount.Add(m.Amount)
    }
    
    // 3. Extract payer and counterparty (invert from original SPLIT)
    firstMovement := movements[0]
    payer := extractParticipant(firstMovement) // From participants
    counterparty := extractPayer(firstMovement) // From payer
    
    // 4. Detect unique template
    templateIDs := make(map[uuid.UUID]bool)
    for _, m := range movements {
        if m.GeneratedFromTemplateID != nil {
            templateIDs[*m.GeneratedFromTemplateID] = true
        }
    }
    
    var categoryID *uuid.UUID
    var templateID *uuid.UUID
    var templateName string
    
    if len(templateIDs) == 1 {
        // All movements have same template (or all are null)
        for id := range templateIDs {
            templateID = &id
            template, err := s.templateRepo.Get(ctx, id)
            if err == nil {
                categoryID = &template.CategoryID
                templateName = template.Name
            }
            break
        }
    }
    
    // 5. Generate description
    description := generateDescription(movements, mode, templateName)
    
    return &DebtPaymentPrefill{
        Type:                "DEBT_PAYMENT",
        Description:         description,
        Amount:              totalAmount,
        PayerUserID:         payer.UserID,
        PayerContactID:      payer.ContactID,
        CounterpartyUserID:  counterparty.UserID,
        CounterpartyContactID: counterparty.ContactID,
        CategoryID:          categoryID,
        TemplateID:          templateID,
        TemplateName:        templateName,
        MovementDate:        time.Now(),
        OriginalMovements:   movements,
    }, nil
}

func generateDescription(movements []Movement, mode string, templateName string) string {
    if mode == "individual" {
        if templateName != "" {
            return fmt.Sprintf("Pago: %s", templateName)
        }
        return fmt.Sprintf("Pago de %s", movements[0].Description)
    }
    
    // mode == "complete"
    if len(movements) == 1 {
        if templateName != "" {
            return fmt.Sprintf("Pago total: %s", templateName)
        }
        return fmt.Sprintf("Pago de %s", movements[0].Description)
    }
    
    // Multiple movements
    payer := extractPayer(movements[0])
    counterparty := extractParticipant(movements[0])
    
    payerName := getPersonName(payer)
    counterpartyName := getPersonName(counterparty)
    
    if templateName != "" {
        // Same template, multiple occurrences
        dates := getDateRange(movements)
        return fmt.Sprintf("Pago total: %s (%s)", templateName, dates)
    }
    
    return fmt.Sprintf("Pago total: %s a %s", payerName, counterpartyName)
}
```

---

### Frontend Integration

#### 1. Préstamos View - Add Menu Items

**Person-level menu:**
```html
<div class="debt-summary">
  <div class="avatars">
    <div class="avatar">PJ</div>
    <div class="avatar">CT</div>
  </div>
  <div class="debt-info">
    <div class="debt-title">Primo Juanda debe a Caro Test</div>
    <div class="debt-amount">$7.782.733</div>
  </div>
  <button class="three-dots-btn" data-debt-summary-menu>⋮</button>
  <div class="three-dots-menu">
    <button data-action="settle-complete">Saldar deuda completa</button>
    <button data-action="view-detail">Ver detalle</button>
  </div>
</div>
```

**Movement-level menu:**
```html
<div class="movement-entry">
  <div class="movement-info">
    <div class="movement-description">Pruba</div>
    <div class="movement-amount">$7.782.733</div>
    <div class="movement-date">9 Ene 2026</div>
  </div>
  <button class="three-dots-btn" data-movement-id="...">⋮</button>
  <div class="three-dots-menu">
    <button data-action="settle">Saldar</button>
    <button data-action="edit">Editar</button>
    <button data-action="delete">Eliminar</button>
  </div>
</div>
```

#### 2. Handle "Saldar" Click

```javascript
// Person-level: Settle complete debt
async function handleSettleComplete(debtorId, creditorId) {
  // Get all movements between these two people
  const movements = await getDebtMovements(debtorId, creditorId);
  const movementIds = movements.map(m => m.id);
  
  // Fetch pre-fill data
  const prefill = await fetch(`/api/loans/debt-payment-prefill?movement_ids=${movementIds.join(',')}&mode=complete`);
  
  // Navigate to movement form with pre-filled data
  navigateToMovementForm(prefill.prefill_data);
}

// Movement-level: Settle individual movement
async function handleSettleMovement(movementId) {
  // Fetch pre-fill data
  const prefill = await fetch(`/api/loans/debt-payment-prefill?movement_ids=${movementId}&mode=individual`);
  
  // Navigate to movement form with pre-filled data
  navigateToMovementForm(prefill.prefill_data);
}

function navigateToMovementForm(prefillData) {
  // Store prefill data in sessionStorage
  sessionStorage.setItem('movement_prefill', JSON.stringify(prefillData));
  
  // Navigate to Gastos tab (movement form)
  window.location.hash = '#gastos';
  
  // Form will read from sessionStorage and pre-fill fields
}
```

#### 3. Movement Form - Read Pre-fill Data

```javascript
// On Gastos tab load
document.addEventListener('DOMContentLoaded', () => {
  const prefillData = sessionStorage.getItem('movement_prefill');
  
  if (prefillData) {
    const data = JSON.parse(prefillData);
    
    // Pre-fill form
    document.getElementById('movement-type').value = data.type;
    document.getElementById('description').value = data.description;
    document.getElementById('amount').value = data.amount;
    document.getElementById('movement-date').value = data.movement_date;
    
    // Payer
    if (data.payer_user_id) {
      document.getElementById('payer').value = data.payer_user_id;
    } else {
      document.getElementById('payer').value = data.payer_contact_id;
    }
    
    // Counterparty
    if (data.counterparty_user_id) {
      document.getElementById('counterparty').value = data.counterparty_user_id;
    } else {
      document.getElementById('counterparty').value = data.counterparty_contact_id;
    }
    
    // Category (if available)
    if (data.category_id) {
      document.getElementById('category').value = data.category_id;
      
      // If template is available, pre-select in dropdown
      if (data.template_id) {
        // IMPORTANT: Don't fetch template again, use data already in prefillData
        
        // Trigger category change to show dropdown
        document.getElementById('category').dispatchEvent(new Event('change'));
        
        // Wait for dropdown to populate, then select template
        setTimeout(() => {
          const templateDropdown = document.getElementById('recurring-template');
          
          // Set template value (use template_id, not fetch again)
          templateDropdown.value = data.template_id;
          
          // Mark as pre-selected (don't trigger change event that would fetch template)
          templateDropdown.dataset.preSelected = 'true';
        }, 100);
      }
    }
    
    // Clear sessionStorage
    sessionStorage.removeItem('movement_prefill');
    
    // Show form (open modal or scroll to form)
    showMovementForm();
  }
});

// Modified template dropdown change handler
document.getElementById('recurring-template').addEventListener('change', (e) => {
  // Skip if this is a pre-selected template (data already loaded)
  if (e.target.dataset.preSelected === 'true') {
    delete e.target.dataset.preSelected;
    return; // Don't fetch template, data already in form
  }
  
  // Normal flow: user manually selected template
  const templateId = e.target.value;
  if (templateId) {
    fetchAndFillTemplate(templateId);
  }
});
```

---

### User Flow Example

**Scenario**: Jose wants to pay rent (Arriendo) that was auto-generated

1. **Navigate to Préstamos tab**
   - Sees: "Jose debe a Arrendamientos la 99 - $3.200.000"
   - Movement: "Arriendo - $3.200.000 - 1 Feb 2026"

2. **Click ⋮ on movement → "Saldar"**
   - Frontend calls: `GET /api/loans/debt-payment-prefill?movement_ids=mov-arriendo-feb&mode=individual`
   - Backend detects: movement has `generated_from_template_id = arriendo-template-uuid`
   - Returns: category_id, template_id, template_name, all pre-filled

3. **Redirect to Gastos tab**
   - Form appears with:
     - Type: DEBT_PAYMENT (selected)
     - Description: "Pago: Arriendo"
     - Amount: $3.200.000 (editable)
     - Payer: Jose
     - Counterparty: Arrendamientos la 99
     - Category: "Gastos fijos" (selected)
     - Dropdown: "Arriendo" (selected, but NO extra fetch)

4. **User reviews and saves**
   - Can modify amount (partial payment)
   - Can change payment method
   - Clicks "Guardar" → debt recorded

---

### Edge Cases

#### Case 1: Partial Payment

User clicks "Saldar" on Arriendo ($3.2M) but only pays $1M:
- Form pre-fills $3.2M
- User changes to $1M
- Saves → creates DEBT_PAYMENT for $1M
- Remaining debt: $2.2M (still shows in Préstamos)

#### Case 2: Multiple Debts, Mixed Templates

Primo Juanda owes:
- Movement 1: "Pruba" - $7M (no template)
- Movement 2: "Compras" - $500K (no template)
- Total: $7.5M

User clicks "Saldar deuda completa":
- Backend detects: no common template
- Returns: category_id = null, template_id = null
- Form pre-fills everything except category
- User can select category if needed (existing validation applies)

#### Case 3: Multiple Months of Same Template

Jose owes rent for Feb, Mar, Apr (didn't pay):
- Feb: $3.2M (arriendo-template)
- Mar: $3.2M (arriendo-template)
- Apr: $3.2M (arriendo-template)
- Total: $9.6M

User clicks "Saldar deuda completa":
- Backend detects: all have same template
- Returns: category_id, template_id, description = "Pago total: Arriendo (Feb-Abr)"
- Form pre-filled completely (including template dropdown)

---

### Implementation Checklist

**Backend:**
- [ ] Create `GET /api/loans/debt-payment-prefill` endpoint
- [ ] Implement template detection logic
- [ ] Generate smart descriptions based on mode and templates
- [ ] Handle person-to-person debt aggregation
- [ ] Return template info in response (avoid frontend re-fetch)

**Frontend:**
- [ ] Add "Saldar deuda completa" to person-level menu
- [ ] Add "Saldar" to movement-level menu
- [ ] Implement pre-fill data fetch on menu click
- [ ] Store pre-fill in sessionStorage
- [ ] Navigate to Gastos tab
- [ ] Pre-fill form from sessionStorage
- [ ] Pre-select template dropdown WITHOUT fetching (use cached data)
- [ ] Allow amount editing (partial payment)
- [ ] Clear sessionStorage after use

**Testing:**
- [ ] Settle single movement with template
- [ ] Settle single movement without template
- [ ] Settle complete debt (same template)
- [ ] Settle complete debt (mixed templates)
- [ ] Partial payment flow
- [ ] Dropdown pre-selection without extra fetch

---

## ✅ Implementation Status (2026-01-19)

### Phase 1: Category Foreign Key Migration ✅ COMPLETE

**Migration 030:**
- ✅ Added `category_id` UUID column to movements table
- ✅ Created foreign key to categories(id) with ON DELETE RESTRICT
- ✅ Created index on category_id
- ✅ Migration applied successfully (version 33)

**Backend changes:**
- ✅ Updated `movements.types.go` with CategoryID field
- ✅ Updated all movement queries to use category_id
- ✅ Both category (VARCHAR) and category_id (UUID) coexist for now
- 🔧 **TODO:** Remove category VARCHAR column after frontend migration

**Status:** ✅ Complete - ready for frontend to use category_id

---

### Phase 2: Recurring Templates Implementation ✅ COMPLETE

**Database Migrations:**
- ✅ Migration 031: `recurring_movement_templates` table with enums (recurrence_pattern, amount_type)
- ✅ Migration 032: Added `generated_from_template_id` to movements (FK with ON DELETE SET NULL)
- ✅ Migration 033: `recurring_movement_participants` junction table
- ✅ All migrations applied successfully (version 33)

**Backend Implementation:**
- ✅ Created `internal/recurringmovements` package (7 files, ~2300 lines)
  - ✅ `types.go` (470 lines) - All type definitions, enums, validation
  - ✅ `repository.go` (654 lines) - PostgreSQL data access
  - ✅ `service.go` (270 lines) - Business logic, role inversion
  - ✅ `generator.go` (167 lines) - Auto-generation logic
  - ✅ `handler.go` (411 lines) - 8 HTTP endpoints
  - ✅ `scheduler.go` (48 lines) - Background scheduler (runs every 12 hours)
  - ✅ `types_test.go` (299 lines) - Validation tests
  - ✅ `generator_test.go` (142 lines) - Date calculation tests

**HTTP Endpoints:**
- ✅ `POST /api/recurring-movements` - Create template
- ✅ `GET /api/recurring-movements` - List templates (with filters)
- ✅ `GET /api/recurring-movements/:id` - Get template by ID
- ✅ `PUT /api/recurring-movements/:id` - Update template
- ✅ `DELETE /api/recurring-movements/:id` - Delete/deactivate template (with scope)
- ✅ `GET /api/recurring-movements/by-category/:categoryId` - List by category
- ✅ `GET /api/recurring-movements/prefill/:id` - Get pre-fill data (supports ?invert_roles=true)
- ✅ `POST /api/recurring-movements/generate` - Manual scheduler trigger (testing)

**Scheduler:**
- ✅ Runs every 12 hours automatically
- ✅ Processes templates with `auto_generate=true` and `next_scheduled_date <= now()`
- ✅ Updates `last_generated_date` and `next_scheduled_date` after generation
- ✅ Sets `generated_from_template_id` on created movements
- ✅ Manual trigger endpoint for testing

**Key Features:**
- ✅ Template dual purpose (auto-generate + dropdown pre-fill)
- ✅ Role inversion logic for SPLIT → DEBT_PAYMENT (inverts payer/participant AND changes movement_type)
- ✅ Three configurations: FIXED+auto, FIXED+manual, VARIABLE
- ✅ Date calculation for MONTHLY (clamps to valid days) and YEARLY (day-of-year)
- ✅ Participant percentage validation (must sum to 100%)
- ✅ CHECK constraints prevent VARIABLE templates with auto_generate=true

**Testing:**
- ✅ **Unit tests:** 38 tests passing (11.3% coverage)
  - ✅ Validation tests (RecurrencePattern, AmountType, NullableDate, CreateTemplateInput)
  - ✅ Date calculation tests (MONTHLY/YEARLY edge cases: Feb 29, day 31, day 366)
- ✅ **Integration tests:** 22 tests passing
  - ✅ Template CRUD operations
  - ✅ Pre-fill data with role inversion
  - ✅ Auto-generation via scheduler
  - ✅ Template detection in movements
  - ✅ Edit/delete with scope (THIS, FUTURE, ALL)

**Bug Fixes Applied:**
- ✅ Fixed role inversion to set movement_type to DEBT_PAYMENT
- ✅ Fixed generator userID determination when payer is contact
- ✅ Fixed generated_from_template_id not being returned in ListByHousehold
- ✅ Fixed NullableDate parsing (accepts both RFC3339 and YYYY-MM-DD)
- ✅ Fixed SQL INSERT placeholder count
- ✅ Fixed repository column names (type vs movement_type, amount vs fixed_amount)

**Status:** ✅ Backend implementation COMPLETE - All tests passing, scheduler running

---

### Phase 3: Frontend Integration 🔧 TODO

**Movement Form Updates:**
- [ ] Add template dropdown (shown when category with templates selected)
- [ ] Fetch templates via `GET /api/recurring-movements/by-category/:categoryId`
- [ ] Pre-fill form when template selected (2 API calls)
  - [ ] Call 1: Fetch template list by category
  - [ ] Call 2: Fetch pre-fill data via `GET /api/recurring-movements/prefill/:id`
- [ ] Handle FIXED vs VARIABLE types (VARIABLE requires manual amount)
- [ ] Label field: "¿Cuál gasto periódico?" (optional field)
- [ ] Disable amount field for FIXED templates
- [ ] Auto-detect role inversion for DEBT_PAYMENT forms (`?invert_roles=true`)

**Movement List Updates:**
- [ ] Show 🔁 badge for movements with `generated_from_template_id`
- [ ] Edit/Delete modals with scope selection (THIS, FUTURE, ALL)
- [ ] Update API calls to pass scope parameter
- [ ] Handle scope=ALL confirmation (deactivates template + deletes all movements)

**API Integration:**
- [ ] Create `movementService.js` functions for template operations
- [ ] Handle error cases (template not found, invalid scope)
- [ ] Add loading states during template fetch

**Status:** 🔧 TODO - Backend ready for frontend integration

---

### Phase 4: "Saldar" Feature Integration 🔧 TODO

**Backend:**
- [ ] Create `GET /api/loans/debt-payment-prefill` endpoint
  - [ ] Detect movements with `generated_from_template_id`
  - [ ] Fetch template for pre-fill (if exists)
  - [ ] Generate smart descriptions based on mode (single/complete)
  - [ ] Handle person-to-person debt aggregation

**Frontend - Préstamos View:**
- [ ] Add "Saldar deuda completa" to person-level three-dot menu
- [ ] Add "Saldar" to movement-level three-dot menu
- [ ] Implement pre-fill data fetch on menu click
- [ ] Store pre-fill in sessionStorage
- [ ] Navigate to Gastos tab with pre-filled form

**Frontend - Movement Form:**
- [ ] Detect sessionStorage pre-fill data on mount
- [ ] Pre-fill form fields from sessionStorage
- [ ] Pre-select template dropdown WITHOUT fetching (use cached data)
- [ ] Allow amount editing (partial payment)
- [ ] Clear sessionStorage after use

**Testing:**
- [ ] Settle single movement with template
- [ ] Settle single movement without template
- [ ] Settle complete debt (same template)
- [ ] Settle complete debt (mixed templates)
- [ ] Partial payment flow
- [ ] Dropdown pre-selection without extra fetch

**Status:** 🔧 TODO - Requires backend endpoint + frontend integration

---

### Phase 5: Testing & Monitoring 🚧 IN PROGRESS

**Unit Tests:**
- ✅ Generator logic (date calculation, edge cases)
- ✅ Template validation (amount types, recurrence patterns, participants)
- ✅ NullableDate parsing (RFC3339, YYYY-MM-DD formats)
- ✅ 38 tests passing with 11.3% coverage

**Integration Tests:**
- ✅ Template CRUD (create, update, delete with scope)
- ✅ Pre-fill data with role inversion
- ✅ Auto-generation via scheduler
- ✅ Template detection in movements
- ✅ 22 tests passing in `test-recurring-movements.sh`

**E2E Tests:**
- [ ] User creates recurring template (FIXED amount, monthly)
- [ ] Scheduler generates movement automatically
- [ ] Movement appears with auto-generated badge
- [ ] User edits movement with FUTURE scope
- [ ] Template and future movements updated
- [ ] User deletes movement with ALL scope
- [ ] Template deactivated and all movements deleted
- [ ] VARIABLE amount flow (manual entry only)

**Logging:**
- ✅ Scheduler logs template processing
- ✅ Generator logs movement creation
- 🔧 **TODO:** Add structured logging with request IDs
- 🔧 **TODO:** Log template updates/deletions

**Monitoring:**
- [ ] Count of templates per household
- [ ] Count of movements generated per day
- [ ] Failed generation attempts (track in database?)
- [ ] Scheduler health check endpoint

**Status:** 🚧 IN PROGRESS - Unit/Integration tests complete, E2E and monitoring TODO

---

### Phase 6: Initial Templates for Jose & Caro 🔧 TODO

**Manual SQL Insertion:**
- [ ] Create Arriendo template (SPLIT, FIXED 3.2M, auto-generate monthly day 1)
- [ ] Create Servicios template (SPLIT, VARIABLE, manual only)
- [ ] Create Internet template (HOUSEHOLD, FIXED 85K, auto-generate monthly day 5)
- [ ] Verify templates created successfully
- [ ] Test auto-generation for Arriendo and Internet
- [ ] Test manual entry with Servicios (variable amount)

**Status:** 🔧 TODO - Can be done via SQL after frontend is ready

---

### Overall Phase 8 Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database Migrations | ✅ COMPLETE | All 4 migrations applied (030-033) |
| Backend Module | ✅ COMPLETE | 7 files, 8 endpoints, scheduler running |
| Backend Optimization | ✅ COMPLETE | `/movement-form-config` includes templates map |
| Unit Tests | ✅ COMPLETE | 38 tests passing (11.3% coverage) |
| Integration Tests | ✅ COMPLETE | 23 tests passing (includes optimization test) |
| E2E Tests | 🔧 TODO | Requires frontend implementation |
| Frontend - Movement Form | ✅ COMPLETE | Template dropdown + pre-fill logic implemented |
| Frontend - Movement List | ✅ COMPLETE | Auto-generated badge + scope modal implemented |
| Frontend - Optimizations | ✅ COMPLETE | All limitations fixed (fetch, spinner, scope, confirm) |
| Frontend - Préstamos View | 🔧 TODO | "Saldar" integration |
| Scheduler | ✅ RUNNING | Every 12 hours + manual trigger |
| Logging/Monitoring | 🚧 PARTIAL | Basic logs, advanced monitoring TODO |
| Initial Templates | 🔧 TODO | Create for Jose & Caro after frontend |

**Frontend Implementation Status (2026-01-20 03:04 UTC):**

✅ **Movement Form (COMPLETE):**
- Template dropdown "¿Cuál gasto periódico?" appears when category selected
- Fetch templates by category: `GET /recurring-movements/by-category/{id}` (TO BE REMOVED)
- Pre-fill form from template: `GET /recurring-movements/prefill/{id}?invert_roles={bool}`
- FIXED templates: Amount pre-filled and disabled
- VARIABLE templates: Amount editable
- Role inversion for DEBT_PAYMENT automatic
- Files modified: `registrar-movimiento.js` (+235 lines), 5 new functions

✅ **Movement List (COMPLETE):**
- Auto-generated badge 🔁 on movements with `generated_from_template_id`
- Scope modal with 3 options (THIS, FUTURE, ALL)
- Modified edit/delete handlers to accept scope parameter
- Files modified: `home.js` (+143 lines), `styles.css` (+98 lines)

✅ **Backend Optimization (COMPLETE - 2026-01-20 03:04 UTC):**
- `/movement-form-config` now includes `recurring_templates` map
- Templates grouped by category_id: `{category_id: [{id, name, amount_type}, ...]}`
- Eliminates need for N per-category API calls
- Function closure used to avoid import cycles (movements ↔ recurringmovements)
- Integration test added (TEST 23) to verify templates in formConfig
- Files modified:
  - `internal/recurringmovements/types.go` - Added ListByCategoryMap() to interface
  - `internal/recurringmovements/service.go` - Implemented ListByCategoryMap()
  - `internal/movements/handler.go` - Updated FormConfigHandler with closure
  - `internal/httpserver/server.go` - Created closure connecting services
  - `tests/api-integration/test-recurring-movements.sh` - Added TEST 23

✅ **Frontend Optimizations (COMPLETE - 2026-01-20 03:15 UTC):**
- **Template fetch optimization:** Frontend now uses templates from formConfig (1 call vs N calls)
  - Removed `fetchTemplatesByCategory()` function (43 lines)
  - Updated category change listener to use `recurringTemplatesMap`
  - Instant template dropdown (no network delay)
- **Loading spinner:** Added animated spinner during template prefill fetch
  - Shows next to "¿Cuál gasto periódico?" label
  - Clear visual feedback for async operation
- **Scope parameter:** Edit form now extracts and uses scope from URL
  - Scope passed to PATCH request: `?scope=${scopeParam}`
  - THIS/FUTURE/ALL editing now works correctly
- **Enhanced delete confirmation:** Extra warning for scope=ALL delete
  - Explains consequences (template + all movements deleted)
  - User can cancel and choose different scope
- Files modified:
  - `frontend/pages/registrar-movimiento.js` (~65 lines modified, net -13 lines)
  - `frontend/pages/home.js` (+15 lines)

**Next Steps:**
1. **"Saldar" Backend Endpoint** - Create debt-payment pre-fill endpoint (2 hours)
2. **"Saldar" Frontend Integration** - Add buttons to Préstamos view (2-3 hours)
3. **E2E Testing** - Test complete user flows (3 hours)
4. **Create Initial Templates** - Add Arriendo, Servicios, Internet for Jose & Caro (30 mins)

**Estimated Time to Complete:** ~7-8 hours (frontend optimizations complete)

---

## 📊 Test Coverage Summary

**Unit Tests (38 tests):**
```
✅ TestRecurrencePatternValidate        - 4 cases
✅ TestAmountTypeValidate               - 4 cases  
✅ TestNullableDateUnmarshalJSON        - 4 cases
✅ TestCreateTemplateInputValidate      - 11 cases
✅ TestCalculateNextScheduledDate       - 6 cases (MONTHLY/YEARLY)
✅ TestCalculateNextScheduledDateEdgeCases - 3 cases

Coverage: 11.3% of statements
```

**Integration Tests (23 tests):**
```
✅ Create FIXED template with auto-generate
✅ Create VARIABLE template without auto-generate
✅ Create template with invalid data (expect error)
✅ List all templates for household
✅ Get template by ID
✅ Get pre-fill data for FIXED template
✅ Get pre-fill data with role inversion
✅ Update template (recalculates next_scheduled_date)
✅ Delete template with scope=THIS (deactivates template)
✅ Delete template with scope=ALL (deletes all movements)
✅ List templates by category
✅ Manual scheduler trigger (generates movements)
✅ Verify generated movements have correct data
✅ Verify template last_generated_date updated
✅ Verify template next_scheduled_date updated
✅ Verify templates included in /movement-form-config (NEW - 2026-01-20)
... and 7 more
```

**Status:** ✅ All tests passing

