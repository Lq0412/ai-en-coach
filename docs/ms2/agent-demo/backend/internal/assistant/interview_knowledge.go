package assistant

import (
	"fmt"
	"strings"
)

func RetrieveScenarioKnowledge(scenarioVariant string, tags []string) ScenarioKnowledge {
	spec, ok := FindScenarioSpec(scenarioVariant)
	if !ok {
		return ScenarioKnowledge{
			ScenarioVariant:   strings.TrimSpace(scenarioVariant),
			KnowledgeTags:     append([]string(nil), tags...),
			CompetencyContext: []string{"Use role-specific scenario knowledge when available; balance it with the user's background."},
			QuestionGuidance:  "Ask a concise, scenario-specific question without inventing user facts.",
		}
	}
	knowledge := ScenarioKnowledge{
		ScenarioVariant: spec.ID,
		KnowledgeTags:   append([]string(nil), spec.KnowledgeTags...),
	}
	switch spec.ID {
	case "go_backend_interview":
		knowledge.CompetencyContext = []string{
			"Goroutines, channels, context cancellation, and avoiding goroutine leaks",
			"Interfaces, error handling, HTTP/RPC service design, SQL, caching, MQ, and observability",
			"Concurrency trade-offs, service reliability, production debugging, and performance bottlenecks",
		}
		knowledge.QuestionGuidance = "Ask Go/backend-specific interview questions balanced with resume evidence."
	case "java_backend_interview":
		knowledge.CompetencyContext = []string{
			"JVM basics, memory model, garbage collection, collections, and concurrency",
			"Spring Boot REST API design, SQL transaction isolation, Redis caching, MQ reliability, and idempotency",
			"Production debugging, distributed-system trade-offs, and backend service design",
		}
		knowledge.QuestionGuidance = "Ask Java/backend-specific interview questions balanced with resume evidence."
	case "frontend_interview":
		knowledge.CompetencyContext = []string{
			"JavaScript/TypeScript, React or modern UI frameworks, state management, and browser rendering",
			"Performance, accessibility, testing, API integration, and product-quality trade-offs",
		}
		knowledge.QuestionGuidance = "Ask frontend-specific questions that reveal product and engineering judgment."
	case "product_manager_interview":
		knowledge.CompetencyContext = []string{
			"User problems, metrics, prioritization, roadmap trade-offs, experiments, and launch decisions",
			"Stakeholder communication, requirement clarity, and post-launch learning",
		}
		knowledge.QuestionGuidance = "Ask product-management questions grounded in metrics, users, and trade-offs."
	case "restaurant_ordering":
		knowledge.CompetencyContext = []string{
			"Ordering food, asking about recommendations, allergies, spice level, substitutions, and the bill",
			"Useful phrases for polite requests, clarifying menu items, and handling service issues",
		}
		knowledge.QuestionGuidance = "Role-play a restaurant ordering scene with short, practical English turns."
	case "apartment_rental":
		knowledge.CompetencyContext = []string{
			"Asking about rent, deposit, lease length, utilities, furniture, roommates, pets, and maintenance",
			"Useful phrases for viewing an apartment, negotiating terms, and clarifying contract rules",
		}
		knowledge.QuestionGuidance = "Role-play a rental conversation with practical questions and natural replies."
	default:
		knowledge.CompetencyContext = []string{"Use scenario-specific knowledge and practical English expressions."}
		knowledge.QuestionGuidance = "Ask a concise, scenario-specific question."
	}
	return knowledge
}

func ScenarioKnowledgePrompt(knowledge ScenarioKnowledge) string {
	if strings.TrimSpace(knowledge.ScenarioVariant) == "" && len(knowledge.CompetencyContext) == 0 {
		return ""
	}
	return fmt.Sprintf(
		"ScenarioVariant: %s\nKnowledgeTags: %s\nCompetencyContext: %s\nQuestionGuidance: %s",
		knowledge.ScenarioVariant,
		strings.Join(knowledge.KnowledgeTags, ", "),
		strings.Join(knowledge.CompetencyContext, " | "),
		knowledge.QuestionGuidance,
	)
}

func interviewRoleGuidance(role string) string {
	normalized := strings.ToLower(strings.TrimSpace(role))
	switch {
	case strings.Contains(normalized, "java"):
		return "Java Backend Engineer focus: JVM basics, collections, concurrency, Spring Boot, REST APIs, SQL transactions, caching, message queues, debugging production services, and trade-offs in distributed systems. Ask questions that clearly exercise Java/backend judgment instead of only asking about resume projects."
	case strings.Contains(normalized, "go") || strings.Contains(normalized, "golang"):
		return "Go Backend Engineer focus: goroutines, channels, context cancellation, error handling, interfaces, HTTP/RPC services, SQL, caching, message queues, observability, and concurrency trade-offs. Ask questions that clearly exercise Go/backend judgment instead of only asking about resume projects."
	case strings.Contains(normalized, "frontend") || strings.Contains(normalized, "front-end"):
		return "Frontend Engineer focus: JavaScript/TypeScript, React or modern UI frameworks, state management, browser rendering, performance, accessibility, testing, API integration, and product-quality trade-offs."
	case strings.Contains(normalized, "product manager"):
		return "Product Manager focus: user problems, metrics, prioritization, roadmap trade-offs, stakeholder communication, experiments, requirement clarity, and launch/post-launch decisions."
	case strings.Contains(normalized, "data analyst"):
		return "Data Analyst focus: SQL, metrics definitions, data quality, experiment analysis, visualization, business interpretation, and communicating uncertainty."
	case strings.Contains(normalized, "machine learning") || strings.Contains(normalized, "ai"):
		return "AI / Machine Learning Engineer focus: model evaluation, data pipelines, feature quality, deployment constraints, error analysis, retrieval or prompting trade-offs, and production monitoring."
	default:
		return "Role focus: ask role-specific competency questions tied to the target role, balancing resume evidence with core technical and behavioral signals."
	}
}
