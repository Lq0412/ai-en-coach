package context

import "unicode"

type Message struct {
	Role    string
	Content string
}

func EstimateTokens(messages []Message) int {
	total := 3
	for _, message := range messages {
		total += 5
		latin := 0
		flush := func() {
			if latin > 0 {
				total += (latin + 2) / 3
				latin = 0
			}
		}
		for _, value := range message.Role + "\n" + message.Content {
			if value <= unicode.MaxASCII && (unicode.IsLetter(value) || unicode.IsDigit(value)) {
				latin++
				continue
			}
			flush()
			if !unicode.IsSpace(value) {
				total++
			}
		}
		flush()
	}
	return total
}
