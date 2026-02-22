package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

const systemPromptTemplate = `Eres un asistente financiero para un hogar en la aplicación de Conti.
La fecha de hoy es %s. El mes actual es %s.
Respondes en español usando formato colombiano para montos (ej: $345.000 COP).
SIEMPRE usa las herramientas disponibles para consultar datos antes de responder. No respondas sin consultar primero.
Cuando el usuario diga "este mes" se refiere a %s. Cuando diga "el mes pasado" se refiere a %s.
Las categorías están organizadas en grupos. Cada grupo agrupa varias categorías.
Una misma categoría puede existir en varios grupos (ej: "Grupo A - Imprevistos" y "Grupo B - Imprevistos").
Los resultados de las herramientas incluyen el campo "group" para cada categoría.
Cuando muestres resultados, usa el formato "Grupo - Categoría" para distinguirlos.
Si el usuario pregunta por una categoría que existe en múltiples grupos, muestra el desglose por grupo.
REGISTRAR GASTOS:
Cuando el usuario quiera registrar o agregar un gasto, llama prepare_movement INMEDIATAMENTE con los datos que te dio.
NO pidas confirmación antes de llamar la herramienta. La herramienta prepara un borrador que el usuario confirmará después.
Si falta la descripción o el monto, pregunta. Pero si mencionó categoría y método de pago, úsalos directamente.
Si la herramienta no encuentra la categoría o método de pago, muestra las opciones disponibles que devuelve.
El tipo por defecto es HOUSEHOLD. La fecha por defecto es hoy.
NO crees el movimiento directamente — la herramienta prepara un borrador que el usuario debe confirmar.

Cita los datos que respaldan tu respuesta.
Si después de consultar no hay datos, dilo claramente.
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

// ChatResult holds the chat response with optional movement draft.
type ChatResult struct {
	Message string
	Draft   *MovementDraft
}

// Chat processes a user message and returns the assistant's response.
// It executes function-calling rounds until the model produces a text response.
func (cs *ChatService) Chat(ctx context.Context, householdID, userID, userMessage string, history []ChatMessage) (*ChatResult, error) {
	tools := ToolDefinitions()

	now := time.Now().In(Bogota)
	currentMonth := now.Format("2006-01")
	lastMonth := now.AddDate(0, -1, 0).Format("2006-01")
	systemPrompt := fmt.Sprintf(systemPromptTemplate,
		now.Format("2006-01-02"), currentMonth, currentMonth, lastMonth)

	messages := []ChatMessage{
		{Role: "system", Content: systemPrompt},
	}

	// Add conversation history for multi-turn context
	for _, h := range history {
		messages = append(messages, h)
	}

	// Add current user message
	messages = append(messages, ChatMessage{Role: "user", Content: userMessage})

	var lastDraft *MovementDraft

	for round := 0; round < maxToolRounds; round++ {
		resp, err := cs.client.ChatCompletions(ctx, messages, tools)
		if err != nil {
			return nil, fmt.Errorf("chat: LLM call failed: %w", err)
		}

		// If no tool calls, we have the final text response
		if len(resp.ToolCalls) == 0 {
			msg := resp.Content
			if msg == "" {
				msg = "No tengo datos suficientes para responder eso."
			}
			return &ChatResult{Message: msg, Draft: lastDraft}, nil
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

			result, err := cs.executor.ExecuteTool(ctx, householdID, userID, tc.Function, tc.Arguments)
			if err != nil {
				cs.logger.Error("chat tool failed",
					"tool", tc.Function,
					"error", err,
				)
				result = fmt.Sprintf(`{"error": "No pude consultar los datos: %s"}`, err.Error())
			}

			// Detect movement draft in tool result
			if tc.Function == "prepare_movement" {
				var draft MovementDraft
				if json.Unmarshal([]byte(result), &draft) == nil && draft.Action == "confirm_movement" {
					lastDraft = &draft
				}
			}

			messages = append(messages, ChatMessage{
				Role:       "tool",
				Content:    result,
				ToolCallID: tc.ID,
			})
		}
	}

	return &ChatResult{Message: "No pude completar la consulta después de varios intentos. Intenta reformular tu pregunta."}, nil
}
