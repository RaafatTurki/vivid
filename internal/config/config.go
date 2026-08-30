package config

import "time"

type Config struct {
	Address           string
	AllowedOrigins    []string
	MaxRoomPeers      int
	ReadHeaderTimeout time.Duration
	IdleTimeout       time.Duration
	StunURLs          []string
	TurnURLs          []string
	TurnSharedSecret  string
	TurnTTL           time.Duration
	UmamiURL          string
	UmamiWebsiteID    string
	UmamiDomain       string
}

func FromEnv() (Config, error) {
	env := newEnvReader()

	cfg := Config{
		Address:           env.String("SIGNAL_ADDRESS", ":8080"),
		AllowedOrigins:    env.Strings("SIGNAL_ALLOWED_ORIGINS", nil),
		MaxRoomPeers:      env.Int("SIGNAL_MAX_ROOM_PEERS", 8),
		ReadHeaderTimeout: env.Duration("SIGNAL_READ_HEADER_TIMEOUT", 5*time.Second),
		IdleTimeout:       env.Duration("SIGNAL_IDLE_TIMEOUT", 60*time.Second),
		StunURLs:          env.Strings("STUN_URLS", nil),
		TurnURLs:          env.Strings("TURN_URLS", nil),
		TurnSharedSecret:  env.String("TURN_SHARED_SECRET", ""),
		TurnTTL:           env.Duration("TURN_TTL", 30*time.Minute),
		UmamiURL:          env.String("UMAMI_URL", ""),
		UmamiWebsiteID:    env.String("UMAMI_WEBSITE_ID", ""),
		UmamiDomain:       env.String("UMAMI_DOMAIN", ""),
	}

	if err := env.Err(); err != nil {
		return Config{}, err
	}

	// if err := cfg.Validate(); err != nil {
	//   return Config{}, err
	// }

	return cfg, nil
}
