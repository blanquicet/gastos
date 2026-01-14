package audit

import (
"encoding/json"
)

// StructToMap converts any struct to map[string]interface{} for audit logging
// This uses JSON marshaling/unmarshaling for simplicity and consistency
func StructToMap(v interface{}) map[string]interface{} {
if v == nil {
return nil
}

// Marshal to JSON
data, err := json.Marshal(v)
if err != nil {
return map[string]interface{}{
"error": "failed to convert struct to map",
}
}

// Unmarshal to map
var result map[string]interface{}
if err := json.Unmarshal(data, &result); err != nil {
return map[string]interface{}{
"error": "failed to unmarshal to map",
}
}

return result
}

// StringPtr is a helper to create string pointers
func StringPtr(s string) *string {
return &s
}
