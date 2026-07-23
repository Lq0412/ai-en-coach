package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant"
	assistantcontext "github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/assistant/context"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/demomodules"
	mem0client "github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/platform/memory/mem0"
	"github.com/1024XEngineer/XE3-ESL-agent-demo/backend/internal/preparation"
)

func main() {
	logger := log.New(os.Stdout, "agent-demo ", log.LstdFlags|log.LUTC)
	config, err := assistant.LoadDashScopeConfig()
	if err != nil {
		logger.Fatalf("DashScope configuration error: %v", err)
	}
	provider := assistant.NewDashScopeProvider(config)
	dataDirectory := os.Getenv("AGENT_DATA_DIR")
	if dataDirectory == "" {
		dataDirectory = ".data"
	}
	store, err := assistant.NewFileConversationStore(filepath.Join(dataDirectory, "conversation.json"))
	if err != nil {
		logger.Fatalf("conversation store error: %v", err)
	}
	state, err := assistant.NewPersistentDemoState(provider, filepath.Join(dataDirectory, "interview-state.json"))
	if err != nil {
		logger.Fatalf("interview state error: %v", err)
	}
	if _, err := preparation.NewFileScenarioRepository(filepath.Join(dataDirectory, "scenarios.json")); err != nil {
		logger.Fatalf("scenario repository error: %v", err)
	}
	preparationService := preparation.NewManagementService(state)
	registry := demomodules.NewRegistry(state, provider)
	mem0BaseURL := os.Getenv("MEM0_BASE_URL")
	if mem0BaseURL == "" {
		mem0BaseURL = "http://127.0.0.1:8766"
	}
	mem0 := mem0client.New(mem0BaseURL)
	healthContext, healthCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer healthCancel()
	if err := mem0.Health(healthContext); err != nil {
		logger.Fatalf("Mem0 sidecar error: %v", err)
	}
	if os.Getenv("MEM0_IMPORT_LEGACY") == "1" {
		legacyPath := filepath.Join(dataDirectory, "memory.sqlite")
		if items, legacyErr := mem0client.LegacyActiveFacts(legacyPath, assistant.DemoUserID); legacyErr != nil {
			logger.Printf("legacy memory migration skipped: %v", legacyErr)
		} else if importErr := mem0.Import(context.Background(), assistant.DemoUserID, items); importErr != nil {
			logger.Printf("legacy memory import failed: %v", importErr)
		} else if len(items) > 0 {
			logger.Printf("legacy active memories checked for Mem0 import count=%d", len(items))
		}
	}
	contextBuilder := assistantcontext.NewBuilder(mem0)
	service := assistant.NewService(assistant.Dependencies{
		Planner:           provider,
		ContextBuilder:    mem0client.AssistantContextBuilder{Builder: contextBuilder},
		MemoryObserver:    mem0,
		Tools:             registry,
		ConversationStore: store,
		Runtime:           state,
		Attachments:       preparationService,
		Resetter:          state,
	})
	handler := assistant.NewHTTPHandler(
		logger,
		service,
		store,
		state,
		preparationService,
		registry,
		provider,
		provider,
		map[string]string{
			"chat":      config.ChatModel,
			"embedding": config.EmbeddingModel,
			"document":  config.DocumentModel,
			"asr":       config.ASRModel,
			"tts":       config.TTSModel,
		},
	)
	mux := http.NewServeMux()
	handler.Register(mux)
	mem0client.NewHTTPHandler(mem0, assistant.DemoUserID).Register(mux)

	addr := os.Getenv("AGENT_DEMO_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	logger.Printf("SpeakUp Agent Demo backend started addr=%s", addr)
	if err := http.ListenAndServe(addr, assistant.CORS(mux)); err != nil {
		logger.Printf("server stopped: %v", err)
		os.Exit(1)
	}
}
