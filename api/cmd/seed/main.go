// Command seed creates the first admin, but only if no users exist yet.
package main

import (
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"

	"transcode/api/config"
	"transcode/api/db"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg.DatabaseURL)
	defer database.Close()
	db.Migrate(database)

	var count int
	if err := database.Get(&count, `SELECT COUNT(*) FROM users`); err != nil {
		log.Fatalf("Failed to count users: %v", err)
	}
	if count > 0 {
		log.Printf("Users already exist (%d) — nothing to seed.", count)
		return
	}

	email := envOr("SEED_ADMIN_EMAIL", "admin@transcode.local")
	name := envOr("SEED_ADMIN_NAME", "Admin")
	password := envOr("SEED_ADMIN_PASSWORD", "Admin123!")

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	// verified_at is set so the seeded admin can log in without the invite flow.
	if _, err := database.Exec(
		`INSERT INTO users (email, password_hash, name, role, verified_at)
		 VALUES ($1, $2, $3, 'admin', NOW())`,
		email, string(hash), name); err != nil {
		log.Fatalf("Failed to create admin: %v", err)
	}

	log.Printf("Created admin %s (password: %s) — change it after first login.", email, password)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
