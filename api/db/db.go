package db

import (
	"log"
	"os"
	"strconv"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"
)

// Connect opens a pool sized for serverless + pgbouncer: small, kept warm,
// recycled often enough that a pooler restart doesn't hand us dead conns.
func Connect(dsn string) *sqlx.DB {
	database, err := sqlx.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	maxOpen := 10
	if v := os.Getenv("DB_MAX_OPEN_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxOpen = n
		}
	}
	database.SetMaxOpenConns(maxOpen)
	database.SetMaxIdleConns(maxOpen)
	database.SetConnMaxIdleTime(4 * time.Minute)
	database.SetConnMaxLifetime(30 * time.Minute)

	if err := database.Ping(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	return database
}

// Migrate applies incremental schema changes. It runs on every startup
// (including every serverless cold start), so every statement must be
// idempotent — IF NOT EXISTS, or a DO $$ ... $$ guard.
func Migrate(database *sqlx.DB) {
	stmts := []string{
		`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,

		`DO $$ BEGIN
			CREATE TYPE "user_role" AS ENUM('admin', 'leader', 'member');
		EXCEPTION WHEN duplicate_object THEN null; END $$;`,

		`CREATE TABLE IF NOT EXISTS users (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			email varchar(255) NOT NULL UNIQUE,
			password_hash varchar(255) NOT NULL,
			name varchar(255) NOT NULL,
			role user_role DEFAULT 'member' NOT NULL,
			verified_at timestamp,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS songs (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			title varchar(255) NOT NULL,
			artist varchar(255) NOT NULL DEFAULT '',
			song_key varchar(12),
			time_signature varchar(12) NOT NULL DEFAULT '4/4',
			tempo integer,
			feel varchar(64) NOT NULL DEFAULT '',
			ccli varchar(32) NOT NULL DEFAULT '',
			notes text NOT NULL DEFAULT '',
			tags text[] NOT NULL DEFAULT '{}',
			content text NOT NULL DEFAULT '',
			created_by uuid REFERENCES users(id) ON DELETE SET NULL,
			updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);`,

		`CREATE INDEX IF NOT EXISTS songs_title_idx ON songs (title);`,

		`CREATE TABLE IF NOT EXISTS setlists (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			name varchar(255) NOT NULL,
			service_date date,
			notes text NOT NULL DEFAULT '',
			created_by uuid REFERENCES users(id) ON DELETE SET NULL,
			created_at timestamp DEFAULT now() NOT NULL,
			updated_at timestamp DEFAULT now() NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS setlist_items (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			setlist_id uuid NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
			song_id uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
			position integer NOT NULL DEFAULT 0,
			key_override varchar(12),
			notes text NOT NULL DEFAULT ''
		);`,

		`CREATE INDEX IF NOT EXISTS setlist_items_setlist_idx ON setlist_items (setlist_id, position);`,

		`CREATE TABLE IF NOT EXISTS song_audio (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
			song_id uuid NOT NULL UNIQUE REFERENCES songs(id) ON DELETE CASCADE,
			storage_path text NOT NULL,
			filename varchar(255) NOT NULL DEFAULT '',
			size_bytes bigint NOT NULL DEFAULT 0,
			uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
			created_at timestamp DEFAULT now() NOT NULL
		);`,

		// song_key was once NOT NULL DEFAULT 'C', which made "in C" and "nobody
		// has said" the same value. Existing rows are deliberately left alone:
		// a stored 'C' can't be told apart from a real C, and blanking them all
		// would erase correct keys to fix incorrect ones.
		`ALTER TABLE songs ALTER COLUMN song_key DROP DEFAULT;`,
		`ALTER TABLE songs ALTER COLUMN song_key DROP NOT NULL;`,
	}

	for _, s := range stmts {
		if _, err := database.Exec(s); err != nil {
			log.Fatalf("Migration failed (%s): %v", s, err)
		}
	}
}
