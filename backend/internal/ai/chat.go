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
Respondes en español usando formato colombiano para montos (ej: $345.000,45 COP).
SIEMPRE usa las herramientas disponibles para consultar datos antes de responder. No respondas sin consultar primero.
Cuando el usuario diga "este mes" se refiere a %s. Cuando diga "el mes pasado" se refiere a %s.
Las categorías están organizadas en grupos. Cada grupo agrupa varias categorías.
Una misma categoría puede existir en varios grupos (ej: "Grupo A - Imprevistos" y "Grupo B - Imprevistos").
Los resultados de las herramientas incluyen el campo "group" para cada categoría.
Cuando muestres resultados, si es una categoría que existe en múltiples grupos, usa el formato "Grupo - Categoría" para distinguirlos.
Si el usuario pregunta por una categoría que existe en múltiples grupos, muestra el desglose por grupo.
REGISTRAR GASTOS:
Cuando el usuario quiera registrar o agregar un gasto, llama prepare_movement INMEDIATAMENTE con los datos que te dio.
NO pidas confirmación antes de llamar la herramienta.
Si falta el monto, pregunta antes de llamar.
Si el usuario menciona una categoría (ej: "en mercado", "en gasolina"), pásala como el parámetro category.
La descripción es opcional — si no la da, se usará la categoría como descripción.
Si falta el método de pago o la categoría, llama prepare_movement de todas formas — omite el parámetro que falte y la herramienta devolverá las opciones disponibles como botones interactivos.
NUNCA preguntes por el método de pago o categoría en texto. SIEMPRE llama prepare_movement y deja que la herramienta devuelva las opciones.
NUNCA listes opciones tú mismo. Solo la herramienta puede mostrar opciones interactivas.
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
	Options []string
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
	var lastOptions []string

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
			return &ChatResult{Message: msg, Draft: lastDraft, Options: lastOptions}, nil
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
				// Detect available options (when category/PM not found)
				var opts map[string]any
				if json.Unmarshal([]byte(result), &opts) == nil {
					for _, key := range []string{"available_categories", "available_payment_methods"} {
						if arr, ok := opts[key]; ok {
							if items, ok := arr.([]any); ok {
								lastOptions = nil
								for _, item := range items {
									if s, ok := item.(string); ok {
										lastOptions = append(lastOptions, s)
									}
								}
							}
						}
					}
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
