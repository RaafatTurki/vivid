package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type envReader struct {
	errs []error
}

func newEnvReader() *envReader {
	return &envReader{}
}

func (e *envReader) String(name, fallback string) string {
	value, ok := os.LookupEnv(name)
	if !ok || value == "" {
		return fallback
	}

	return value
}

func (e *envReader) Strings(name string, fallback []string) []string {
	value, ok := os.LookupEnv(name)
	if !ok || value == "" {
		return fallback
	}

	items := strings.Split(value, ",")
	result := make([]string, 0, len(items))

	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			result = append(result, item)
		}
	}

	return result
}

func (e *envReader) Int(name string, fallback int) int {
	value, ok := os.LookupEnv(name)
	if !ok || value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		e.errs = append(e.errs, fmt.Errorf(
			"%s must be an integer: %q",
			name,
			value,
		))

		return fallback
	}

	return parsed
}

func (e *envReader) Duration(name string, fallback time.Duration) time.Duration {
	value, ok := os.LookupEnv(name)
	if !ok || value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		e.errs = append(e.errs, fmt.Errorf(
			"%s must be a valid duration: %q",
			name,
			value,
		))

		return fallback
	}

	return parsed
}

func (e *envReader) Err() error {
	return errors.Join(e.errs...)
}
