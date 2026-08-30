package analytics

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/raafat/vivid/internal/config"
)

const (
	queueSize      = 256
	requestTimeout = 2 * time.Second
)

type Client struct {
	enabled    bool
	url        string
	websiteID  string
	hostname   string
	logger     *slog.Logger
	httpClient *http.Client
	events     chan event
	done       chan struct{}
}

type event struct {
	name      string
	ip        string
	userAgent string
	path      string
	props     map[string]any
}

func New(cfg config.Config, logger *slog.Logger) *Client {
	if logger == nil {
		logger = slog.Default()
	}
	c := &Client{
		enabled:   cfg.UmamiURL != "",
		url:       cfg.UmamiURL,
		websiteID: cfg.UmamiWebsiteID,
		hostname:  cfg.UmamiDomain,
		logger:    logger,
		httpClient: &http.Client{
			Timeout: requestTimeout,
		},
		events: make(chan event, queueSize),
		done:   make(chan struct{}),
	}
	if c.enabled {
		go c.run()
	} else {
		close(c.done)
	}
	return c
}

func (c *Client) Track(name, ip, userAgent, path string, props map[string]any) {
	if !c.enabled {
		return
	}
	select {
	case c.events <- event{name: name, ip: ip, userAgent: userAgent, path: path, props: props}:
	default:
		c.logger.Debug("analytics queue full, dropping event", "event", name)
	}
}

func (c *Client) Close() {
	if !c.enabled {
		return
	}
	close(c.events)
	<-c.done
}

func (c *Client) run() {
	defer close(c.done)
	for e := range c.events {
		c.send(e)
	}
}

func (c *Client) send(e event) {
	body, err := json.Marshal(map[string]any{
		"type": "event",
		"payload": map[string]any{
			"website":  c.websiteID,
			"hostname": c.hostname,
			"url":      e.path,
			"name":     e.name,
			"data":     e.props,
		},
	})
	if err != nil {
		c.logger.Debug("analytics event marshal failed", "event", e.name, "error", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url+"/api/send", bytes.NewReader(body))
	if err != nil {
		c.logger.Debug("analytics request build failed", "event", e.name, "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if e.userAgent != "" {
		req.Header.Set("User-Agent", e.userAgent)
	}
	if e.ip != "" {
		req.Header.Set("X-Forwarded-For", e.ip)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		c.logger.Debug("analytics event delivery failed", "event", e.name, "error", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		c.logger.Debug("analytics event rejected", "event", e.name, "status", resp.StatusCode)
	}
}
