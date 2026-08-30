package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	ossignal "os/signal"
	"syscall"
	"time"

	"github.com/raafat/vivid/internal/analytics"
	"github.com/raafat/vivid/internal/config"
	signaling "github.com/raafat/vivid/internal/signal"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	hub := signaling.NewHub(cfg.MaxRoomPeers)
	analyticsClient := analytics.New(cfg, logger)
	defer analyticsClient.Close()
	handler := signaling.NewServer(cfg, hub, logger, analyticsClient)
	server := &http.Server{
		Addr:              cfg.Address,
		Handler:           handler.Routes(),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	ctx, stop := ossignal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("signaling server listening", "address", cfg.Address)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server stopped unexpectedly", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("signaling server stopped")
}
