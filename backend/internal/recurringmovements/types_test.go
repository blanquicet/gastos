package recurringmovements

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/blanquicet/gastos/backend/internal/movements"
)

// TestRecurrencePatternValidate tests RecurrencePattern validation
func TestRecurrencePatternValidate(t *testing.T) {
	tests := []struct {
		name    string
		pattern RecurrencePattern
		wantErr bool
	}{
		{"Valid MONTHLY", RecurrenceMonthly, false},
		{"Valid YEARLY", RecurrenceYearly, false},
		{"Valid ONE_TIME", RecurrenceOneTime, false},
		{"Invalid pattern", RecurrencePattern("WEEKLY"), true},
		{"Empty pattern", RecurrencePattern(""), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.pattern.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("RecurrencePattern.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestNullableDateUnmarshalJSON tests date parsing
func TestNullableDateUnmarshalJSON(t *testing.T) {
	tests := []struct {
		name    string
		json    string
		wantErr bool
		check   func(*NullableDate) bool
	}{
		{
			name:    "RFC3339 format",
			json:    `"2026-01-15T10:30:00Z"`,
			wantErr: false,
			check: func(d *NullableDate) bool {
				return d.Valid && d.Time.Year() == 2026 && d.Time.Month() == 1 && d.Time.Day() == 15
			},
		},
		{
			name:    "YYYY-MM-DD format",
			json:    `"2026-03-20"`,
			wantErr: false,
			check: func(d *NullableDate) bool {
				return d.Valid && d.Time.Year() == 2026 && d.Time.Month() == 3 && d.Time.Day() == 20
			},
		},
		{
			name:    "null value",
			json:    `null`,
			wantErr: false,
			check: func(d *NullableDate) bool {
				return !d.Valid
			},
		},
		{
			name:    "Invalid format",
			json:    `"20/01/2026"`,
			wantErr: true,
			check:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var d NullableDate
			err := json.Unmarshal([]byte(tt.json), &d)
			if (err != nil) != tt.wantErr {
				t.Errorf("NullableDate.UnmarshalJSON() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && tt.check != nil && !tt.check(&d) {
				t.Errorf("NullableDate.UnmarshalJSON() validation failed for %s", tt.name)
			}
		})
	}
}

// TestCreateTemplateInputValidate tests template input validation
func TestCreateTemplateInputValidate(t *testing.T) {
	amount := 100000.0
	categoryID := "cat-123"
	payerUserID := "user-123"
	participantUserID := "participant-123"
	dayOfMonth := 1
	startDate := &NullableDate{Valid: true, Time: time.Now()}
	recurrence := RecurrenceMonthly
	autoGenTrue := true
	autoGenFalse := false

	tests := []struct {
		name    string
		input   *CreateTemplateInput
		wantErr bool
		errMsg  string
	}{
		{
			name: "Valid template with auto_generate",
			input: &CreateTemplateInput{
				Name:              "Rent",
				MovementType:      movements.TypeSplit,
				Amount:            amount,
				CategoryID:        &categoryID,
				PayerUserID:       &payerUserID,
				AutoGenerate:      &autoGenTrue,
				RecurrencePattern: &recurrence,
				DayOfMonth:        &dayOfMonth,
				StartDate:         startDate,
				Participants: []TemplateParticipantInput{
					{ParticipantUserID: &participantUserID, Percentage: 1.0},
				},
			},
			wantErr: false,
		},
		{
			name: "Valid template without auto_generate",
			input: &CreateTemplateInput{
				Name:         "Utilities",
				MovementType: movements.TypeSplit,
				Amount:       amount,
				CategoryID:   &categoryID,
				PayerUserID:  &payerUserID,
				Participants: []TemplateParticipantInput{
					{ParticipantUserID: &participantUserID, Percentage: 1.0},
				},
			},
			wantErr: false,
		},
		{
			name: "Missing name",
			input: &CreateTemplateInput{
				Name:         "",
				MovementType: movements.TypeSplit,
				Amount:       amount,
			},
			wantErr: true,
			errMsg:  "name is required",
		},
		{
			name: "Missing amount",
			input: &CreateTemplateInput{
				Name:         "Test",
				MovementType: movements.TypeSplit,
			},
			wantErr: true,
			errMsg:  "amount is required and must be greater than 0",
		},
		{
			name: "auto_generate without recurrence",
			input: &CreateTemplateInput{
				Name:         "Test",
				MovementType: movements.TypeSplit,
				Amount:       amount,
				AutoGenerate: &autoGenTrue,
			},
			wantErr: true,
			errMsg:  "recurrence_pattern and start_date required when auto_generate is true",
		},
		{
			name: "MONTHLY without day_of_month",
			input: &CreateTemplateInput{
				Name:              "Test",
				MovementType:      movements.TypeSplit,
				Amount:            amount,
				AutoGenerate:      &autoGenTrue,
				RecurrencePattern: &recurrence,
				StartDate:         startDate,
			},
			wantErr: true,
			errMsg:  "day_of_month required for MONTHLY recurrence",
		},
		{
			name: "Invalid day_of_month",
			input: &CreateTemplateInput{
				Name:              "Test",
				MovementType:      movements.TypeSplit,
				Amount:            amount,
				AutoGenerate:      &autoGenTrue,
				RecurrencePattern: &recurrence,
				StartDate:         startDate,
				DayOfMonth:        intPtr(35),
			},
			wantErr: true,
			errMsg:  "day_of_month must be between 1 and 31",
		},
		{
			name: "YEARLY without day_of_year",
			input: &CreateTemplateInput{
				Name:              "Test",
				MovementType:      movements.TypeSplit,
				Amount:            amount,
				AutoGenerate:      &autoGenTrue,
				RecurrencePattern: recurrencePtr(RecurrenceYearly),
				StartDate:         startDate,
			},
			wantErr: true,
			errMsg:  "day_of_year required for YEARLY recurrence",
		},
		{
			name: "SPLIT without participants",
			input: &CreateTemplateInput{
				Name:         "Test",
				MovementType: movements.TypeSplit,
				Amount:       amount,
				CategoryID:   &categoryID,
				PayerUserID:  &payerUserID,
				AutoGenerate: &autoGenFalse,
			},
			wantErr: true,
			errMsg:  "participants required for SPLIT templates",
		},
		{
			name: "Invalid participant percentage sum",
			input: &CreateTemplateInput{
				Name:         "Test",
				MovementType: movements.TypeSplit,
				Amount:       amount,
				CategoryID:   &categoryID,
				PayerUserID:  &payerUserID,
				AutoGenerate: &autoGenFalse,
				Participants: []TemplateParticipantInput{
					{ParticipantUserID: strPtr("user1"), Percentage: 0.5},
					{ParticipantUserID: strPtr("user2"), Percentage: 0.3},
				},
			},
			wantErr: true,
			errMsg:  "participant percentages must sum to 100%",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.input.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("CreateTemplateInput.Validate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr && tt.errMsg != "" && err.Error() != tt.errMsg {
				t.Errorf("CreateTemplateInput.Validate() error message = %v, want %v", err.Error(), tt.errMsg)
			}
		})
	}
}

// Helper functions
func intPtr(i int) *int {
	return &i
}

func strPtr(s string) *string {
	return &s
}

func recurrencePtr(r RecurrencePattern) *RecurrencePattern {
	return &r
}
