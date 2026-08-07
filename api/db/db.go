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

		// A saved pitch offset for the reference recording, in semitones. It
		// belongs to the track, not the chart — the recording may sit in a
		// different key or run a touch sharp — so it lives on song_audio and is
		// shared team-wide. 0 is the recording's original pitch.
		`ALTER TABLE song_audio ADD COLUMN IF NOT EXISTS tune_offset smallint NOT NULL DEFAULT 0;`,
		// Per-setlist override of that tune. NULL means "use the recording's
		// saved tune", mirroring how key_override falls back to the song key.
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS tune_offset smallint;`,

		// Colour-coded note cards, each optionally anchored to a chart section.
		`ALTER TABLE songs ADD COLUMN IF NOT EXISTS note_cards jsonb NOT NULL DEFAULT '[]'::jsonb;`,
		// Migrate the old single free-text note into one general amber card, then
		// blank it so this backfill is a one-shot (the WHERE stops matching once
		// note_cards is populated and notes is cleared).
		`UPDATE songs
		    SET note_cards = jsonb_build_array(jsonb_build_object('color', 'amber', 'text', notes, 'section', '')),
		        notes = ''
		  WHERE note_cards = '[]'::jsonb AND btrim(notes) <> '';`,

		// Setlist items own a snapshot copy of the song taken when it was added.
		// Editing the copy never touches the songbank, and songbank edits never
		// leak into existing setlists (an explicit re-sync re-pulls them).
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS title varchar(255) NOT NULL DEFAULT '';`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS artist varchar(255) NOT NULL DEFAULT '';`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS song_key varchar(12);`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS time_signature varchar(12) NOT NULL DEFAULT '4/4';`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS tempo integer;`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS feel varchar(64) NOT NULL DEFAULT '';`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '';`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS note_cards jsonb NOT NULL DEFAULT '[]'::jsonb;`,

		// One-shot backfill of pre-snapshot rows. title = '' marks a row that has
		// never been snapshotted (song titles can't be empty), so this stops
		// matching after the first run.
		`UPDATE setlist_items i
		    SET title = s.title, artist = s.artist, song_key = s.song_key,
		        time_signature = s.time_signature, tempo = s.tempo, feel = s.feel,
		        content = s.content, note_cards = s.note_cards
		   FROM songs s
		  WHERE s.id = i.song_id AND i.title = '';`,

		// Items used to die with their songbank song (ON DELETE CASCADE). Now the
		// snapshot must survive deletion, so the FK becomes SET NULL. The lookup
		// by confdeltype makes this a one-shot regardless of the constraint's
		// auto-generated name, and a no-op on databases created from schema.sql.
		`DO $$
		DECLARE con text;
		BEGIN
			SELECT conname INTO con FROM pg_constraint
			 WHERE conrelid = 'setlist_items'::regclass
			   AND confrelid = 'songs'::regclass
			   AND contype = 'f' AND confdeltype = 'c';
			IF con IS NOT NULL THEN
				EXECUTE format('ALTER TABLE setlist_items DROP CONSTRAINT %I', con);
				ALTER TABLE setlist_items
					ADD CONSTRAINT setlist_items_song_id_fkey
					FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE SET NULL;
			END IF;
		END $$;`,
		`ALTER TABLE setlist_items ALTER COLUMN song_id DROP NOT NULL;`,

		// How many columns the chart renders in (1 or 2). A songbank choice,
		// snapshotted into setlist items like every other chart field.
		`ALTER TABLE songs ADD COLUMN IF NOT EXISTS chart_columns smallint NOT NULL DEFAULT 1;`,
		`ALTER TABLE setlist_items ADD COLUMN IF NOT EXISTS chart_columns smallint NOT NULL DEFAULT 1;`,

		// Per-user, per-item preferences: capo shapes and a private note. Each
		// account sees only its own row; nothing here is shared with the team.
		`CREATE TABLE IF NOT EXISTS setlist_item_prefs (
			setlist_item_id uuid NOT NULL REFERENCES setlist_items(id) ON DELETE CASCADE,
			user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			capo smallint NOT NULL DEFAULT 0,
			notes text NOT NULL DEFAULT '',
			updated_at timestamp DEFAULT now() NOT NULL,
			PRIMARY KEY (setlist_item_id, user_id)
		);`,
		`CREATE INDEX IF NOT EXISTS setlist_item_prefs_user_idx ON setlist_item_prefs (user_id);`,

		// A second way to sign in. Nullable because every existing account
		// predates it and none should be forced to invent one. Stored
		// lowercased at every write site, which is what lets a plain UNIQUE do
		// case-insensitive uniqueness without dragging in citext — the login
		// lookup lowercases its input to match. A partial index excluding NULLs
		// would be redundant: Postgres already treats NULLs as distinct, so any
		// number of accounts can sit without a username. The name matches the
		// constraint schema.sql declares, so handlers can recognise a username
		// collision by name on either a migrated or a freshly-created database.
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(64);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);`,
	}

	for _, s := range stmts {
		if _, err := database.Exec(s); err != nil {
			log.Fatalf("Migration failed (%s): %v", s, err)
		}
	}
}
