package ai

import (
"context"
"encoding/json"
"fmt"
"log/slog"

"github.com/openai/openai-go/v3"
"github.com/openai/openai-go/v3/azure"
"github.com/openai/openai-go/v3/shared"
)

// Config holds Azure OpenAI connection settings.
type Config struct {
Endpoint   string // e.g. "https://xxx.openai.azure.com"
APIKey     string
Deployment string // e.g. "gpt-4o-mini"
APIVersion string // defaults to "2024-10-21"
}

// Client wraps the OpenAI Go SDK configured for Azure.
type Client struct {
inner      *openai.Client
deployment string
logger     *slog.Logger
}

// NewClient creates a new Azure OpenAI client.
func NewClient(cfg *Config, logger *slog.Logger) (*Client, error) {
if cfg.Endpoint == "" || cfg.APIKey == "" || cfg.Deployment == "" {
return nil, fmt.Errorf("ai: endpoint, api_key, and deployment are all required")
}

apiVersion := cfg.APIVersion
if apiVersion == "" {
apiVersion = "2024-10-21"
}

client := openai.NewClient(
azure.WithEndpoint(cfg.Endpoint, apiVersion),
azure.WithAPIKey(cfg.APIKey),
)

return &Client{
inner:      &client,
deployment: cfg.Deployment,
logger:     logger,
}, nil
}

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
Role       string     // "system", "user", "assistant", "tool"
Content    string
ToolCallID string     // only for role="tool"
ToolCalls  []ToolCall // only for role="assistant" (forwarding tool calls back)
}

// ToolCall represents a function call requested by the model.
type ToolCall struct {
ID        string
Function  string
Arguments string // raw JSON
}

// ChatResponse holds the model's response.
type ChatResponse struct {
Content   string     // text response (empty if tool calls requested)
ToolCalls []ToolCall // function calls to execute (empty if text response)
}

// Tool defines a function the model can call.
type Tool struct {
Name        string
Description string
Parameters  map[string]any // JSON schema
}

// ChatCompletions sends messages to the model and returns the response.
func (c *Client) ChatCompletions(ctx context.Context, messages []ChatMessage, tools []Tool) (*ChatResponse, error) {
params := openai.ChatCompletionNewParams{
Model:       openai.ChatModel(c.deployment),
Messages:    convertMessages(messages),
Temperature: openai.Float(0.0),
}

if len(tools) > 0 {
params.Tools = convertTools(tools)
}

resp, err := c.inner.Chat.Completions.New(ctx, params)
if err != nil {
return nil, fmt.Errorf("ai: chat completions failed: %w", err)
}

if len(resp.Choices) == 0 {
return nil, fmt.Errorf("ai: no choices in response")
}

choice := resp.Choices[0]
result := &ChatResponse{
Content: choice.Message.Content,
}

for _, tc := range choice.Message.ToolCalls {
result.ToolCalls = append(result.ToolCalls, ToolCall{
ID:       tc.ID,
Function: tc.Function.Name,
Arguments: tc.Function.Arguments,
})
}

return result, nil
}

func convertMessages(msgs []ChatMessage) []openai.ChatCompletionMessageParamUnion {
out := make([]openai.ChatCompletionMessageParamUnion, 0, len(msgs))
for _, m := range msgs {
out = append(out, convertMessage(m))
}
return out
}

func convertMessage(m ChatMessage) openai.ChatCompletionMessageParamUnion {
switch m.Role {
case "system":
return openai.ChatCompletionMessageParamUnion{
OfSystem: &openai.ChatCompletionSystemMessageParam{
Content: openai.ChatCompletionSystemMessageParamContentUnion{
OfString: openai.String(m.Content),
},
},
}
case "assistant":
msg := &openai.ChatCompletionAssistantMessageParam{
Content: openai.ChatCompletionAssistantMessageParamContentUnion{
OfString: openai.String(m.Content),
},
}
for _, tc := range m.ToolCalls {
msg.ToolCalls = append(msg.ToolCalls, openai.ChatCompletionMessageToolCallUnionParam{
OfFunction: &openai.ChatCompletionMessageFunctionToolCallParam{
ID: tc.ID,
Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{
Name:      tc.Function,
Arguments: tc.Arguments,
},
},
})
}
return openai.ChatCompletionMessageParamUnion{OfAssistant: msg}
case "tool":
return openai.ChatCompletionMessageParamUnion{
OfTool: &openai.ChatCompletionToolMessageParam{
Content: openai.ChatCompletionToolMessageParamContentUnion{
OfString: openai.String(m.Content),
},
ToolCallID: m.ToolCallID,
},
}
default: // "user"
return openai.ChatCompletionMessageParamUnion{
OfUser: &openai.ChatCompletionUserMessageParam{
Content: openai.ChatCompletionUserMessageParamContentUnion{
OfString: openai.String(m.Content),
},
},
}
}
}

func convertTools(tools []Tool) []openai.ChatCompletionToolUnionParam {
out := make([]openai.ChatCompletionToolUnionParam, 0, len(tools))
for _, t := range tools {
paramBytes, _ := json.Marshal(t.Parameters)
var fp openai.FunctionParameters
_ = json.Unmarshal(paramBytes, &fp)

out = append(out, openai.ChatCompletionToolUnionParam{
OfFunction: &openai.ChatCompletionFunctionToolParam{
Function: shared.FunctionDefinitionParam{
Name:        t.Name,
Description: openai.String(t.Description),
Parameters:  fp,
},
},
})
}
return out
}
