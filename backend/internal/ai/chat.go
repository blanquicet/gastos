package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

const systemPromptTemplate = `Eres un asistente financiero para un hogar colombiano en Conti.
Hoy: %s. Ayer: %s. Mes actual: %s.
Usuario: %s (= "yo", "mi"). Cuando diga "%s", se refiere a sí mismo. Miembros del hogar: %s (= "nosotros").
Formato: montos en COP colombiano ($345.000 COP). Responde en español.

TIPOS DE MOVIMIENTO:
- HOUSEHOLD: Gasto del hogar (mercado, servicios, gasolina). Requiere categoría y método de pago.
- SPLIT: Préstamo (pagador presta, participante debe). Ej: "Le presté 50000 a Maria Isabel".
- DEBT_PAYMENT: Pago de deuda. Ej: "Maria Isabel me pagó 30000".

CONTEXTO TEMPORAL:
"este mes" = %s. "el mes pasado" = %s. "ayer" = %s. "hoy" = %s.
Para consultas de un día específico, usa start_date y end_date en get_movements_summary.

CATEGORÍAS:
Organizadas en grupos. Una categoría puede existir en varios grupos (ej: "Jose > Imprevistos" y "Caro > Imprevistos").
En resultados usa "Grupo > Categoría" para distinguir duplicados.

CONSULTAS:
SIEMPRE usa herramientas para consultar datos. Nunca inventes datos. Cita evidencia. Sé conciso.

REGISTRAR GASTOS (HOUSEHOLD) — usa prepare_movement:
- Llama INMEDIATAMENTE con los datos disponibles. No pidas confirmación.
- Si falta el monto, pregunta. Si falta categoría o método de pago, llama de todas formas — la herramienta mostrará opciones interactivas.
- SIEMPRE infiere category del mensaje ("Uber de mi casa al trabajo" → category="Uber", "Compré mercado en el Euro" → category="Mercado"). Solo omite si no hay pista.
- SIEMPRE infiere description del mensaje ("Compré mercado en el Euro" → description="Mercado en el Euro"). No uses la categoría como descripción. Haz tu mejor esfuerzo para generar una descripción útil.
- NUNCA preguntes opciones en texto. NUNCA listes opciones tú mismo. Solo la herramienta puede mostrar botones.
- Fecha por defecto: hoy (%s). "ayer" → date=%s.

PRÉSTAMOS (SPLIT/DEBT_PAYMENT) — usa prepare_loan (NO prepare_movement):
- "Le presté X a [persona]" → SPLIT, I_TO_THEM
- "[persona] me prestó X" → SPLIT, THEM_TO_ME
- "Le pagué X a [persona]" → DEBT_PAYMENT, I_TO_THEM
- "[persona] me pagó X" → DEBT_PAYMENT, THEM_TO_ME`

// maxToolRounds limits function-calling iterations to prevent infinite loops.
const maxToolRounds = 3

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
func (cs *ChatService) Chat(ctx context.Context, householdID, userID, userName string, memberNames []string, userMessage string, history []ChatMessage) (*ChatResult, error) {
	tools := ToolDefinitions()

	now := time.Now().In(Bogota)
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	currentMonth := now.Format("2006-01")
	lastMonth := now.AddDate(0, -1, 0).Format("2006-01")
	allMembers := userName
	if len(memberNames) > 0 {
		allMembers = userName + ", " + strings.Join(memberNames, ", ")
	}
	systemPrompt := fmt.Sprintf(systemPromptTemplate,
		today, yesterday, currentMonth, userName, userName, allMembers,
		currentMonth, lastMonth, yesterday, today, today, yesterday)

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
			if tc.Function == "prepare_movement" || tc.Function == "prepare_loan" {
				var draft MovementDraft
				if json.Unmarshal([]byte(result), &draft) == nil && draft.Action == "confirm_movement" {
					lastDraft = &draft
					// Short-circuit: return draft immediately without extra LLM call
					msg := fmt.Sprintf("He preparado el registro. %s por %s. ¿Deseas confirmarlo?",
						draft.Description, FormatCOP(draft.Amount))
					return &ChatResult{Message: msg, Draft: lastDraft}, nil
				}
				// Detect available options (when category/PM/account not found)
				var opts map[string]any
				if json.Unmarshal([]byte(result), &opts) == nil {
					for _, key := range []string{"available_categories", "available_payment_methods", "available_people", "available_accounts"} {
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
					// Short-circuit: return options immediately without extra LLM call
					if len(lastOptions) > 0 {
						errMsg := ""
						if e, ok := opts["error"].(string); ok {
							errMsg = e
						} else {
							errMsg = "Selecciona una opción"
						}
						return &ChatResult{Message: errMsg, Options: lastOptions}, nil
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
