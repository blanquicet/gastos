package recurringmovements

import (
	"testing"
	"time"
)

// TestCalculateNextScheduledDate tests date calculation logic for recurrence patterns
func TestCalculateNextScheduledDate(t *testing.T) {
	tests := []struct {
		name       string
		from       time.Time
		pattern    RecurrencePattern
		dayOfMonth *int
		dayOfYear  *int
		wantYear   int
		wantMonth  time.Month
		wantDay    int
	}{
		{
			name:       "MONTHLY - next month same day",
			from:       time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC),
			pattern:    RecurrenceMonthly,
			dayOfMonth: intPtr(15),
			wantYear:   2026,
			wantMonth:  time.February,
			wantDay:    15,
		},
		{
			name:       "MONTHLY - day 31 in Feb (clamps to 28)",
			from:       time.Date(2026, 1, 31, 10, 0, 0, 0, time.UTC),
			pattern:    RecurrenceMonthly,
			dayOfMonth: intPtr(31),
			wantYear:   2026,
			wantMonth:  time.February,
			wantDay:    28,
		},
		{
			name:       "MONTHLY - day 31 in April (clamps to 30)",
			from:       time.Date(2026, 3, 31, 10, 0, 0, 0, time.UTC),
			pattern:    RecurrenceMonthly,
			dayOfMonth: intPtr(31),
			wantYear:   2026,
			wantMonth:  time.April,
			wantDay:    30,
		},
		{
			name:       "MONTHLY - December to January next year",
			from:       time.Date(2025, 12, 15, 10, 0, 0, 0, time.UTC),
			pattern:    RecurrenceMonthly,
			dayOfMonth: intPtr(15),
			wantYear:   2026,
			wantMonth:  time.January,
			wantDay:    15,
		},
		{
			name:      "YEARLY - same day next year",
			from:      time.Date(2025, 6, 15, 10, 0, 0, 0, time.UTC),
			pattern:   RecurrenceYearly,
			dayOfYear: intPtr(166), // June 15
			wantYear:  2026,
			wantMonth: time.June,
			wantDay:   15,
		},
		{
			name:      "YEARLY - day 366 in non-leap year (goes to next year day 1)",
			from:      time.Date(2025, 12, 31, 10, 0, 0, 0, time.UTC),
			pattern:   RecurrenceYearly,
			dayOfYear: intPtr(366),
			wantYear:  2026, // 2026-01-01 + 365 days = 2027-01-01, but checks current year first
			wantMonth: time.January,
			wantDay:   1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Call the actual function from repository.go
			nextDate := calculateNextScheduledDate(tt.from, &tt.pattern, tt.dayOfMonth, tt.dayOfYear)

			// Verify
			if nextDate.Year() != tt.wantYear {
				t.Errorf("Year = %v, want %v", nextDate.Year(), tt.wantYear)
			}
			if nextDate.Month() != tt.wantMonth {
				t.Errorf("Month = %v, want %v", nextDate.Month(), tt.wantMonth)
			}
			if nextDate.Day() != tt.wantDay {
				t.Errorf("Day = %v, want %v", nextDate.Day(), tt.wantDay)
			}
		})
	}
}

// TestCalculateNextScheduledDateEdgeCases tests edge cases
func TestCalculateNextScheduledDateEdgeCases(t *testing.T) {
	t.Run("Leap year February 29", func(t *testing.T) {
		// 2024 is a leap year
		lastGenerated := time.Date(2024, 1, 29, 10, 0, 0, 0, time.UTC)
		pattern := RecurrenceMonthly
		dayOfMonth := 29

		nextDate := calculateNextScheduledDate(lastGenerated, &pattern, &dayOfMonth, nil)

		// Should get Feb 29, 2024 (leap year)
		if nextDate.Year() != 2024 || nextDate.Month() != time.February || nextDate.Day() != 29 {
			t.Errorf("Expected Feb 29, 2024, got %v", nextDate)
		}

		// Next one after Feb should be March 29
		nextDate2 := calculateNextScheduledDate(nextDate, &pattern, &dayOfMonth, nil)
		if nextDate2.Year() != 2024 || nextDate2.Month() != time.March || nextDate2.Day() != 29 {
			t.Errorf("Expected March 29, 2024, got %v", nextDate2)
		}
	})

	t.Run("Day of year 1 (January 1)", func(t *testing.T) {
		lastGenerated := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
		pattern := RecurrenceYearly
		dayOfYear := 1

		nextDate := calculateNextScheduledDate(lastGenerated, &pattern, nil, &dayOfYear)

		if nextDate.Year() != 2026 || nextDate.Month() != time.January || nextDate.Day() != 1 {
			t.Errorf("Expected Jan 1, 2026, got %v", nextDate)
		}
	})

	t.Run("Day of year 365 (December 31 in non-leap year)", func(t *testing.T) {
		lastGenerated := time.Date(2025, 12, 31, 10, 0, 0, 0, time.UTC)
		pattern := RecurrenceYearly
		dayOfYear := 365

		nextDate := calculateNextScheduledDate(lastGenerated, &pattern, nil, &dayOfYear)

		if nextDate.Year() != 2026 || nextDate.Month() != time.December || nextDate.Day() != 31 {
			t.Errorf("Expected Dec 31, 2026, got %v", nextDate)
		}
	})
}
