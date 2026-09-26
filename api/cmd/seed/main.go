// Command seed creates the first admin, but only if no users exist yet.
//
// There is no password: the row is created by email, and the moment that
// person signs in through Auth0 with the same (verified) address it is linked
// to their Auth0 identity, admin role intact. Without this, the first person
// to sign in would just be a member with nobody able to promote them.
package main

import (
	"log"
	"os"

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

	if _, err := database.Exec(
		`INSERT INTO users (email, name, role, approved_at) VALUES (lower($1), $2, 'admin', NOW())`,
		email, name); err != nil {
		log.Fatalf("Failed to create admin: %v", err)
	}

	log.Printf("Created admin %s — sign in through Auth0 with that email to claim it.", email)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
