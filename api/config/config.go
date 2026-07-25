package config

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL string
	JWTSecret   string
	WebURL      string // comma-separated list of allowed CORS origins
	Port        string

	// Supabase Storage, for song reference tracks. Optional — when unset the
	// audio endpoints report themselves unavailable rather than failing hard,
	// so the rest of the app still runs without storage configured.
	SupabaseURL     string
	SupabaseKey     string // service role key; never leaves the server
	SupabaseBucket  string
	MaxAudioUploads int
}

func Load() *Config {
	// Absent in serverless; the platform injects env directly.
	_ = godotenv.Load()

	cfg := &Config{
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		WebURL:         os.Getenv("WEB_URL"),
		Port:           os.Getenv("PORT"),
		SupabaseURL:    strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		SupabaseKey:    os.Getenv("SUPABASE_SERVICE_KEY"),
		SupabaseBucket: os.Getenv("SUPABASE_AUDIO_BUCKET"),
	}

	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}
	if cfg.WebURL == "" {
		cfg.WebURL = "http://localhost:5173"
	}
	if cfg.Port == "" {
		cfg.Port = "8082"
	}
	if cfg.SupabaseBucket == "" {
		cfg.SupabaseBucket = "song-audio"
	}

	// Storage is the scarce resource here, so the ceiling is configurable
	// without a redeploy.
	cfg.MaxAudioUploads = 30
	if v := os.Getenv("MAX_AUDIO_UPLOADS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.MaxAudioUploads = n
		}
	}
	return cfg
}
