package ai

import (
	"context"
	"fmt"
	"log/slog"
)

const systemPrompt = `Eres un asistente financiero para un hogar colombiano. 
Respondes en español usando formato colombiano para montos (ej: $345.000 COP).
Cuando consultes datos, usa las herramientas disponibles. Cita los datos que respaldan tu respuesta.
Si no tienes datos suficientes para responder, di: "No tengo datos suficientes para responder eso."
Nunca inventes datos. Sé conciso y directo.`

// maxToolRounds limits function-calling iterations to prevent infinite loops.
const maxToolRounds = 5

// ChatService handles chat conversations with function calling.
type ChatService struct {
	client   *Client
	executor *ToolExecutor
	logger   *slog.Logger
}

// NewChatService creates a new chat service.
func NewChatService(client *Client, executor *ToolExecutor, logger *slog.Logger) *ChatService {
	return &ChatService{
		client:   client,
		executor: executor,
		logger:   logger,
	}
}

// Chat processes a user message and returns the assistant's response.
// It executes function-calling rounds until the model produces a text response.
func (cs *ChatService) Chat(ctx context.Context, householdID, userMessage string) (string, error) {
	tools := ToolDefinitions()

	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	for round := 0; round < maxToolRounds; round++ {
		resp, err := cs.client.ChatCompletions(ctx, messages, tools)
		if err != nil {
			return "", fmt.Errorf("chat: LLM call failed: %w", err)
		}

		// If no tool calls, we have the final text response
		if len(resp.ToolCalls) == 0 {
			if resp.Content == "" {
				return "No tengo datos suficientes para responder eso.", nil
			}
			return resp.Content, nil
		}

		// Add the assistant message with tool calls to the conversation
		messages = append(messages, ChatMessage{
			Role:      "assistant",
			Content:   resp.Content,
			ToolCalls: resp.ToolCalls,
		})

		// Execute each tool call and add results
		for _, tc := range resp.ToolCalls {
			cs.logger.Info("executing chat tool",
				"tool", tc.Function,
				"household_id", householdID,
			)

			result, err := cs.executor.ExecuteTool(ctx, householdID, tc.Function, tc.Arguments)
			if err != nil {
				cs.logger.Error("chat tool failed",
					"tool", tc.Function,
					"error", err,
				)
				result = fmt.Sprintf(`{"error": "No pude consultar los datos: %s"}`, err.Error())
			}

			messages = append(messages, ChatMessage{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}
	}

	return "No pude completar la consulta después de varios intentos. Intenta reformular tu pregunta.", nil
}
