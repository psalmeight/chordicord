// Package prayer is the prayer list app. It shares the API process, the
// database and the users table (so the same Auth0 sign-in and roles apply)
// with the songbook, but owns nothing in `public`: every table lives in its
// own `prayer` Postgres schema, and nothing here reads or writes chord data.
package prayer

import (
	"log"

	"github.com/jmoiron/sqlx"
)

// Migrate creates the prayer schema. Like db.Migrate it runs on every
// startup (and serverless cold start), so every statement is idempotent.
func Migrate(database *sqlx.DB) {
	stmts := []string{
		`CREATE SCHEMA IF NOT EXISTS prayer;`,

		`CREATE TABLE IF NOT EXISTS prayer.categories (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			name varchar(120) NOT NULL,
			created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);`,
		// Case-insensitive, so "Family" and "family" can't both exist. The
		// handlers recognise a collision by this name.
		`CREATE UNIQUE INDEX IF NOT EXISTS categories_name_key ON prayer.categories (lower(name));`,

		// category_id NULL means uncategorized. Deleting a category leaves its
		// prayers in place, uncategorized, rather than taking them with it.
		`CREATE TABLE IF NOT EXISTS prayer.prayers (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			category_id uuid REFERENCES prayer.categories(id) ON DELETE SET NULL,
			title varchar(255) NOT NULL,
			details text NOT NULL DEFAULT '',
			created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
			updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS prayers_category_idx ON prayer.prayers (category_id);`,
	}

	for _, s := range stmts {
		if _, err := database.Exec(s); err != nil {
			log.Fatalf("Prayer migration failed (%s): %v", s, err)
		}
	}
}
