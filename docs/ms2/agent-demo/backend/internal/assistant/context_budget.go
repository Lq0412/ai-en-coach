package assistant

import (
	"fmt"
	"unicode"
)

const ContextTokenLimit = 10_000

type ContextLimitError struct {
	TokenCount int
	TokenLimit int
}

func (e ContextLimitError) Error() string {
	return fmt.Sprintf(
		"assistant: context token limit exceeded: %d > %d; start a new conversation",
		e.TokenCount,
		e.TokenLimit,
	)
}

// EstimateContextTokens uses a deterministic conservative estimate for Qwen
// multilingual chat input: CJK and punctuation count as one token; contiguous
// Latin letters and digits count as one token per three runes. Per-message
// framing is included so the limit is enforced before the provider call.
func EstimateContextTokens(messages []ContextMessage) int {
	total := 3
	for _, message := range messages {
		total += 5
		latinRunes := 0
		flushLatin := func() {
			if latinRunes > 0 {
				total += (latinRunes + 2) / 3
				latinRunes = 0
			}
		}
		for _, value := range message.Role + "\n" + message.Content {
			if value <= unicode.MaxASCII && (unicode.IsLetter(value) || unicode.IsDigit(value)) {
				latinRunes++
				continue
			}
			flushLatin()
			if !unicode.IsSpace(value) {
				total++
			}
		}
		flushLatin()
	}
	return total
}
