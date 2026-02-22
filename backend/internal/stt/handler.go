package stt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/blanquicet/conti/backend/internal/auth"
)

const (
	maxUploadSize = 10 << 20 // 10MB (60s recording)
	maxWAVSize    = 4 << 20  // 4MB (60s PCM 16kHz mono ≈ 2MB)
	ffmpegTimeout = 10 * time.Second
	speechTimeout = 15 * time.Second
	tokenScope    = "https://cognitiveservices.azure.com/.default"
)

// Config holds Speech-to-Text configuration.
type Config struct {
	Region     string // e.g. "westus2"
	Language   string // e.g. "es-CO"
	ResourceID string // Azure resource ID for the Speech account
}

// Handler provides HTTP endpoint for speech-to-text.
type Handler struct {
	authService *auth.Service
	cookieName  string
	config      *Config
	cred        *azidentity.DefaultAzureCredential
	logger      *slog.Logger
	limiter     *rateLimiter
}

// NewHandler creates a new STT handler.
func NewHandler(authService *auth.Service, cookieName string, config *Config, logger *slog.Logger) *Handler {
	var cred *azidentity.DefaultAzureCredential
	if config.Region != "" {
		var err error
		cred, err = azidentity.NewDefaultAzureCredential(nil)
		if err != nil {
			logger.Error("failed to create Azure credential for STT", "error", err)
		}
	}

	return &Handler{
		authService: authService,
		cookieName:  cookieName,
		config:      config,
		cred:        cred,
		logger:      logger,
		limiter:     newRateLimiter(10, time.Minute),
	}
}

// HandleSTT processes POST /stt requests.
func (h *Handler) HandleSTT(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Check if STT is configured
	if h.config.Region == "" || h.cred == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{"error": "STT no configurado"})
		return
	}

	// CSRF check
	if r.Header.Get("X-Requested-With") != "conti" {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "forbidden"})
		return
	}

	// Auth via session cookie
	cookie, err := r.Cookie(h.cookieName)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	user, err := h.authService.GetUserBySession(r.Context(), cookie.Value)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	// Rate limit
	if !h.limiter.allow(user.ID) {
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]string{"error": "demasiadas solicitudes, intenta en un momento"})
		return
	}

	start := time.Now()

	// Parse multipart
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "audio demasiado grande (máx 5MB)"})
		return
	}

	file, header, err := r.FormFile("audio")
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "campo 'audio' requerido"})
		return
	}
	defer file.Close()

	// Save to temp file (stream, don't buffer in RAM)
	inputFile, err := os.CreateTemp("", "stt-input-*")
	if err != nil {
		h.logger.Error("failed to create temp file", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
		return
	}
	defer os.Remove(inputFile.Name())

	if _, err := io.Copy(inputFile, file); err != nil {
		inputFile.Close()
		h.logger.Error("failed to write temp file", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
		return
	}
	inputFile.Close()

	inputBytes := header.Size

	// Detect input format from filename
	filename := header.Filename
	isOgg := strings.HasSuffix(filename, ".ogg")
	isWebm := strings.HasSuffix(filename, ".webm")

	var audioData []byte
	var contentType string

	if isOgg {
		// OGG/Opus → send directly to Azure Speech (no conversion needed)
		audioData, err = os.ReadFile(inputFile.Name())
		if err != nil {
			h.logger.Error("failed to read OGG", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
			return
		}
		contentType = "audio/ogg; codecs=opus"
		h.logger.Info("stt format", "path", "direct-ogg", "user_id", user.ID)

	} else if isWebm {
		// WebM/Opus → fast remux to OGG (no transcode, ~50ms)
		outputFile, err := os.CreateTemp("", "stt-output-*.ogg")
		if err != nil {
			h.logger.Error("failed to create output temp file", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
			return
		}
		defer os.Remove(outputFile.Name())
		outputFile.Close()

		ctx, cancel := context.WithTimeout(r.Context(), ffmpegTimeout)
		defer cancel()

		cmd := exec.CommandContext(ctx, "ffmpeg",
			"-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1",
			"-i", inputFile.Name(),
			"-c:a", "copy", "-f", "ogg",
			"-y", outputFile.Name(),
		)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr

		if err := cmd.Run(); err != nil {
			h.logger.Error("ffmpeg remux failed", "error", err, "stderr", stderr.String(), "user_id", user.ID)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "no se pudo procesar el audio"})
			return
		}

		audioData, err = os.ReadFile(outputFile.Name())
		if err != nil {
			h.logger.Error("failed to read OGG", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
			return
		}
		contentType = "audio/ogg; codecs=opus"
		h.logger.Info("stt format", "path", "webm-to-ogg-remux", "user_id", user.ID)

	} else {
		// MP4/other → full transcode to WAV PCM 16kHz mono
		outputFile, err := os.CreateTemp("", "stt-output-*.wav")
		if err != nil {
			h.logger.Error("failed to create output temp file", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
			return
		}
		defer os.Remove(outputFile.Name())
		outputFile.Close()

		ctx, cancel := context.WithTimeout(r.Context(), ffmpegTimeout)
		defer cancel()

		cmd := exec.CommandContext(ctx, "ffmpeg",
			"-nostdin", "-hide_banner", "-loglevel", "error", "-threads", "1",
			"-i", inputFile.Name(),
			"-ac", "1", "-ar", "16000", "-f", "wav",
			"-y", outputFile.Name(),
		)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr

		if err := cmd.Run(); err != nil {
			h.logger.Error("ffmpeg transcode failed", "error", err, "stderr", stderr.String(), "user_id", user.ID)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "no se pudo procesar el audio"})
			return
		}

		audioData, err = os.ReadFile(outputFile.Name())
		if err != nil {
			h.logger.Error("failed to read WAV", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "error interno"})
			return
		}
		contentType = "audio/wav; codecs=audio/pcm; samplerate=16000"
		h.logger.Info("stt format", "path", "mp4-to-wav-transcode", "user_id", user.ID)
	}

	if len(audioData) > maxWAVSize {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "audio demasiado largo"})
		return
	}

	// Call Azure Speech REST API with Managed Identity
	text, err := h.transcribe(r.Context(), audioData, contentType)
	if err != nil {
		h.logger.Error("speech API failed", "error", err, "user_id", user.ID)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "error al transcribir"})
		return
	}

	h.logger.Info("stt completed",
		"user_id", user.ID,
		"latency_ms", time.Since(start).Milliseconds(),
		"input_bytes", inputBytes,
		"status", "ok",
	)

	json.NewEncoder(w).Encode(map[string]string{"text": text})
}

// transcribe sends WAV audio to Azure Speech REST API using Managed Identity.
func (h *Handler) transcribe(ctx context.Context, audioData []byte, contentType string) (string, error) {
	// Get access token via DefaultAzureCredential
	token, err := h.cred.GetToken(ctx, policy.TokenRequestOptions{
		Scopes: []string{tokenScope},
	})
	if err != nil {
		return "", fmt.Errorf("get Azure token: %w", err)
	}

	// Build authorization header: aad#<resourceId>#<accessToken>
	authValue := fmt.Sprintf("aad#%s#%s", h.config.ResourceID, token.Token)

	url := fmt.Sprintf(
		"https://%s.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=%s",
		h.config.Region, h.config.Language,
	)

	// Retry once for 429/503
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			time.Sleep(1 * time.Second)
		}

		reqCtx, cancel := context.WithTimeout(ctx, speechTimeout)
		defer cancel()

		req, err := http.NewRequestWithContext(reqCtx, "POST", url, bytes.NewReader(audioData))
		if err != nil {
			return "", fmt.Errorf("create request: %w", err)
		}

		req.Header.Set("Authorization", "Bearer "+authValue)
		req.Header.Set("Content-Type", contentType)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("speech request: %w", err)
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 429 || resp.StatusCode == 503 {
			if attempt == 0 {
				continue
			}
			return "", fmt.Errorf("speech API rate limited (status %d)", resp.StatusCode)
		}

		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("speech API error (status %d): %s", resp.StatusCode, string(body))
		}

		var result struct {
			RecognitionStatus string `json:"RecognitionStatus"`
			DisplayText       string `json:"DisplayText"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return "", fmt.Errorf("parse response: %w", err)
		}

		if result.RecognitionStatus != "Success" {
			return "", nil // No speech recognized — return empty
		}

		return result.DisplayText, nil
	}

	return "", fmt.Errorf("speech API failed after retries")
}

// --- Simple Rate Limiter ---

type rateLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	requests map[string][]time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		limit:    limit,
		window:   window,
		requests: make(map[string][]time.Time),
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	times := rl.requests[key]
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.limit {
		rl.requests[key] = valid
		return false
	}

	rl.requests[key] = append(valid, now)
	return true
}
