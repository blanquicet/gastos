package creditcards

import (
	"testing"
	"time"
)

func TestCalculateBillingCycle_NilCutoff(t *testing.T) {
	// When cutoff is nil, it should use the last day of the month
	date := time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, nil)

	// January 15 is before cutoff (31), so cycle is: Jan 1 to Feb 1 (exclusive)
	expectedStart := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC)

	if !cycle.StartDate.Equal(expectedStart) {
		t.Errorf("StartDate = %v, want %v", cycle.StartDate, expectedStart)
	}
	if !cycle.EndDate.Equal(expectedEnd) {
		t.Errorf("EndDate = %v, want %v", cycle.EndDate, expectedEnd)
	}
}

func TestCalculateBillingCycle_BeforeCutoff(t *testing.T) {
	// Date is before cutoff day
	cutoff := 15
	date := time.Date(2026, time.January, 10, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, &cutoff)

	// Day 10 < cutoff 15, so cycle is: Dec 16 to Jan 16 (exclusive)
	expectedStart := time.Date(2025, time.December, 16, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.January, 16, 0, 0, 0, 0, time.UTC)

	if !cycle.StartDate.Equal(expectedStart) {
		t.Errorf("StartDate = %v, want %v", cycle.StartDate, expectedStart)
	}
	if !cycle.EndDate.Equal(expectedEnd) {
		t.Errorf("EndDate = %v, want %v", cycle.EndDate, expectedEnd)
	}
}

func TestCalculateBillingCycle_AfterCutoff(t *testing.T) {
	// Date is after cutoff day
	cutoff := 15
	date := time.Date(2026, time.January, 20, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, &cutoff)

	// Day 20 > cutoff 15, so cycle is: Jan 16 to Feb 16 (exclusive)
	expectedStart := time.Date(2026, time.January, 16, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.February, 16, 0, 0, 0, 0, time.UTC)

	if !cycle.StartDate.Equal(expectedStart) {
		t.Errorf("StartDate = %v, want %v", cycle.StartDate, expectedStart)
	}
	if !cycle.EndDate.Equal(expectedEnd) {
		t.Errorf("EndDate = %v, want %v", cycle.EndDate, expectedEnd)
	}
}

func TestCalculateBillingCycle_OnCutoffDay(t *testing.T) {
	// Date is exactly on cutoff day - should be treated as "before or equal"
	cutoff := 15
	date := time.Date(2026, time.January, 15, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, &cutoff)

	// Day 15 == cutoff 15, so cycle is: Dec 16 to Jan 16 (exclusive)
	expectedStart := time.Date(2025, time.December, 16, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.January, 16, 0, 0, 0, 0, time.UTC)

	if !cycle.StartDate.Equal(expectedStart) {
		t.Errorf("StartDate = %v, want %v", cycle.StartDate, expectedStart)
	}
	if !cycle.EndDate.Equal(expectedEnd) {
		t.Errorf("EndDate = %v, want %v", cycle.EndDate, expectedEnd)
	}
}

func TestCalculateBillingCycle_EndOfYear(t *testing.T) {
	// Test year boundary - December with cutoff
	cutoff := 20
	date := time.Date(2025, time.December, 25, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, &cutoff)

	// Day 25 > cutoff 20, so cycle is: Dec 21 to Jan 21 (exclusive)
	expectedStart := time.Date(2025, time.December, 21, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.January, 21, 0, 0, 0, 0, time.UTC)

	if !cycle.StartDate.Equal(expectedStart) {
		t.Errorf("StartDate = %v, want %v", cycle.StartDate, expectedStart)
	}
	if !cycle.EndDate.Equal(expectedEnd) {
		t.Errorf("EndDate = %v, want %v", cycle.EndDate, expectedEnd)
	}
}

func TestCalculateBillingCycle_February(t *testing.T) {
	// Test February (short month) with cutoff day 30
	cutoff := 30
	date := time.Date(2026, time.February, 15, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, &cutoff)

	// Day 15 < cutoff 30, but Feb only has 28 days
	// So cycle is: Jan 31 to Mar 1 (exclusive, since Feb 28+1 = Mar 1)
	expectedStart := time.Date(2026, time.January, 31, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC)

	if !cycle.StartDate.Equal(expectedStart) {
		t.Errorf("StartDate = %v, want %v", cycle.StartDate, expectedStart)
	}
	if !cycle.EndDate.Equal(expectedEnd) {
		t.Errorf("EndDate = %v, want %v", cycle.EndDate, expectedEnd)
	}
}

func TestCalculateBillingCycle_Label(t *testing.T) {
	cutoff := 15
	date := time.Date(2026, time.January, 10, 0, 0, 0, 0, time.UTC)
	cycle := CalculateBillingCycle(date, &cutoff)

	expectedLabel := "Dic 16 - Ene 15"
	if cycle.Label != expectedLabel {
		t.Errorf("Label = %v, want %v", cycle.Label, expectedLabel)
	}
}

func TestLastDayOfMonth(t *testing.T) {
	tests := []struct {
		year  int
		month time.Month
		want  int
	}{
		{2026, time.January, 31},
		{2026, time.February, 28},
		{2024, time.February, 29}, // Leap year
		{2026, time.April, 30},
		{2026, time.December, 31},
	}

	for _, tt := range tests {
		got := lastDayOfMonth(tt.year, tt.month)
		if got != tt.want {
			t.Errorf("lastDayOfMonth(%d, %v) = %d, want %d", tt.year, tt.month, got, tt.want)
		}
	}
}

func TestApplyFilters_NoFilters(t *testing.T) {
	svc := &service{}
	cards := []*CardSummary{
		{ID: "card1", OwnerID: "owner1"},
		{ID: "card2", OwnerID: "owner2"},
	}

	filter := &SummaryFilter{}
	result := svc.applyFilters(cards, filter)

	if len(result) != 2 {
		t.Errorf("applyFilters with no filters returned %d cards, want 2", len(result))
	}
}

func TestApplyFilters_ByCardID(t *testing.T) {
	svc := &service{}
	cards := []*CardSummary{
		{ID: "card1", OwnerID: "owner1"},
		{ID: "card2", OwnerID: "owner2"},
		{ID: "card3", OwnerID: "owner1"},
	}

	filter := &SummaryFilter{CardIDs: []string{"card1", "card3"}}
	result := svc.applyFilters(cards, filter)

	if len(result) != 2 {
		t.Errorf("applyFilters by card ID returned %d cards, want 2", len(result))
	}
	for _, card := range result {
		if card.ID != "card1" && card.ID != "card3" {
			t.Errorf("applyFilters returned unexpected card: %s", card.ID)
		}
	}
}

func TestApplyFilters_ByOwnerID(t *testing.T) {
	svc := &service{}
	cards := []*CardSummary{
		{ID: "card1", OwnerID: "owner1"},
		{ID: "card2", OwnerID: "owner2"},
		{ID: "card3", OwnerID: "owner1"},
	}

	filter := &SummaryFilter{OwnerIDs: []string{"owner1"}}
	result := svc.applyFilters(cards, filter)

	if len(result) != 2 {
		t.Errorf("applyFilters by owner ID returned %d cards, want 2", len(result))
	}
	for _, card := range result {
		if card.OwnerID != "owner1" {
			t.Errorf("applyFilters returned card with wrong owner: %s", card.OwnerID)
		}
	}
}

func TestApplyFilters_CombinedFilters(t *testing.T) {
	svc := &service{}
	cards := []*CardSummary{
		{ID: "card1", OwnerID: "owner1"},
		{ID: "card2", OwnerID: "owner2"},
		{ID: "card3", OwnerID: "owner1"},
	}

	// Card must be card1 or card2 AND owner must be owner1
	filter := &SummaryFilter{
		CardIDs:  []string{"card1", "card2"},
		OwnerIDs: []string{"owner1"},
	}
	result := svc.applyFilters(cards, filter)

	// Only card1 satisfies both conditions
	if len(result) != 1 {
		t.Errorf("applyFilters with combined filters returned %d cards, want 1", len(result))
	}
	if len(result) > 0 && result[0].ID != "card1" {
		t.Errorf("applyFilters returned wrong card: %s, want card1", result[0].ID)
	}
}
