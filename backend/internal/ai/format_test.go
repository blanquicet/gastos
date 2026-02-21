package ai

import (
	"testing"
	"time"
)

func TestFormatCOP(t *testing.T) {
	tests := []struct {
		amount   float64
		expected string
	}{
		{0, "$0"},
		{500, "$500"},
		{1000, "$1.000"},
		{22000, "$22.000"},
		{345000, "$345.000"},
		{1234567, "$1.234.567"},
		{3200000, "$3.200.000"},
		{23378619, "$23.378.619"},
		{99.50, "$100"},
		{-50000, "-$50.000"},
	}

	for _, tt := range tests {
		got := FormatCOP(tt.amount)
		if got != tt.expected {
			t.Errorf("FormatCOP(%v) = %q, want %q", tt.amount, got, tt.expected)
		}
	}
}

func TestFormatMonth(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"2026-01", "Enero 2026"},
		{"2026-02", "Febrero 2026"},
		{"2026-12", "Diciembre 2026"},
		{"invalid", "invalid"},
	}

	for _, tt := range tests {
		got := FormatMonth(tt.input)
		if got != tt.expected {
			t.Errorf("FormatMonth(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestMonthRange(t *testing.T) {
	start, end, err := MonthRange("2026-02")
	if err != nil {
		t.Fatalf("MonthRange: %v", err)
	}

	if start.Year() != 2026 || start.Month() != time.February || start.Day() != 1 {
		t.Errorf("start = %v, want 2026-02-01", start)
	}
	if end.Year() != 2026 || end.Month() != time.March || end.Day() != 1 {
		t.Errorf("end = %v, want 2026-03-01", end)
	}
	if start.Location().String() != Bogota.String() {
		t.Errorf("timezone = %v, want %v", start.Location(), Bogota)
	}

	// Invalid input
	_, _, err = MonthRange("bad")
	if err == nil {
		t.Error("expected error for invalid month format")
	}
	_, _, err = MonthRange("2026-13")
	if err == nil {
		t.Error("expected error for month 13")
	}
}

func TestFormatDate(t *testing.T) {
	dt := time.Date(2026, time.February, 15, 13, 30, 0, 0, Bogota)
	got := FormatDate(dt)
	expected := "15 de febrero de 2026"
	if got != expected {
		t.Errorf("FormatDate = %q, want %q", got, expected)
	}
}

func TestCurrentMonth(t *testing.T) {
	m := CurrentMonth()
	if len(m) < 6 || m[4] != '-' {
		t.Errorf("CurrentMonth() = %q, expected YYYY-MM format", m)
	}
}
