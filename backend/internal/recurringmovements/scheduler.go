package recurringmovements

import (
	"context"
	"log/slog"
	"time"
)

// Scheduler runs periodic tasks to generate movements from templates
type Scheduler struct {
	generator *Generator
	logger    *slog.Logger
	stopChan  chan struct{}
}

// NewScheduler creates a new scheduler
func NewScheduler(generator *Generator, logger *slog.Logger) *Scheduler {
	return &Scheduler{
		generator: generator,
		logger:    logger,
		stopChan:  make(chan struct{}),
	}
}

// Start begins the scheduler loop (runs every 12 hours)
func (s *Scheduler) Start(ctx context.Context) {
	ticker := time.NewTicker(12 * time.Hour)
	defer ticker.Stop()

	s.logger.Info("recurring movements scheduler started (runs every 12 hours)")

	// Run immediately on start
	if err := s.generator.ProcessPendingTemplates(ctx); err != nil {
		s.logger.Error("failed to process pending templates on startup", "error", err)
	}

	for {
		select {
		case <-ticker.C:
			s.logger.Debug("scheduler tick: processing pending templates")
			if err := s.generator.ProcessPendingTemplates(ctx); err != nil {
				s.logger.Error("failed to process pending templates", "error", err)
			}
		case <-s.stopChan:
			s.logger.Info("recurring movements scheduler stopped")
			return
		case <-ctx.Done():
			s.logger.Info("recurring movements scheduler context canceled")
			return
		}
	}
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	close(s.stopChan)
}
