package ai

import (
	"fmt"
	"strings"
	"time"
)

// Bogota is the timezone for Colombia (UTC-5).
var Bogota *time.Location

func init() {
	var err error
	Bogota, err = time.LoadLocation("America/Bogota")
	if err != nil {
		// Fallback: UTC-5 fixed offset
		Bogota = time.FixedZone("COT", -5*60*60)
	}
}

// MonthRange returns the start (inclusive) and end (exclusive) timestamps for a
// given month string "YYYY-MM" in America/Bogota timezone.
func MonthRange(monthStr string) (start, end time.Time, err error) {
	var year, month int
	if _, err = fmt.Sscanf(monthStr, "%d-%d", &year, &month); err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid month format %q (expected YYYY-MM): %w", monthStr, err)
	}
	if month < 1 || month > 12 {
		return time.Time{}, time.Time{}, fmt.Errorf("month %d out of range 1-12", month)
	}

	start = time.Date(year, time.Month(month), 1, 0, 0, 0, 0, Bogota)
	end = start.AddDate(0, 1, 0) // first day of next month
	return start, end, nil
}

// CurrentMonth returns the current month as "YYYY-MM" in Bogota timezone.
func CurrentMonth() string {
	now := time.Now().In(Bogota)
	return fmt.Sprintf("%d-%02d", now.Year(), now.Month())
}

// FormatCOP formats an amount as Colombian pesos with thousands separator.
// Examples: 345000 → "$345.000", 1234567.50 → "$1.234.568"
func FormatCOP(amount float64) string {
	negative := amount < 0
	if negative {
		amount = -amount
	}

	rounded := int64(amount + 0.5)
	s := fmt.Sprintf("%d", rounded)

	// Insert thousands separators (dots)
	var result strings.Builder
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result.WriteByte('.')
		}
		result.WriteRune(ch)
	}

	if negative {
		return "-$" + result.String()
	}
	return "$" + result.String()
}

// FormatMonth formats "YYYY-MM" as a Spanish month name.
// Example: "2026-02" → "Febrero 2026"
func FormatMonth(monthStr string) string {
	var year, month int
	if _, err := fmt.Sscanf(monthStr, "%d-%d", &year, &month); err != nil || month < 1 || month > 12 {
		return monthStr
	}
	return fmt.Sprintf("%s %d", spanishMonths[month-1], year)
}

// FormatDate formats a time as "15 de febrero de 2026" in Bogota timezone.
func FormatDate(t time.Time) string {
	t = t.In(Bogota)
	return fmt.Sprintf("%d de %s de %d", t.Day(), strings.ToLower(spanishMonths[t.Month()-1]), t.Year())
}

var spanishMonths = [12]string{
	"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
	"Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
}
