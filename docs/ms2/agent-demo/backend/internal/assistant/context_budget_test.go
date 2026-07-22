package assistant

import (
	"strings"
	"testing"
)

func TestEstimateContextTokensCountsCJKConservatively(t *testing.T) {
	messages := []ContextMessage{{
		Role:    "user",
		Content: strings.Repeat("大", ContextTokenLimit),
	}}
	if got := EstimateContextTokens(messages); got <= ContextTokenLimit {
		t.Fatalf("token estimate = %d, want greater than %d", got, ContextTokenLimit)
	}
}
