-- Transcode base schema. Applied to a fresh database by `go run ./cmd/migrate -schema`.
-- Incremental changes belong in db.Migrate() as IF NOT EXISTS-guarded statements.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
	CREATE TYPE "public"."user_role" AS ENUM('admin', 'leader', 'member');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"artist" varchar(255) NOT NULL DEFAULT '',
	-- The key the `content` chords are actually written in. Transposition is
	-- always computed as a delta from this, never baked into the stored text.
	-- NULL means the key is genuinely unknown. It must stay distinguishable
	-- from 'C': every transposition is a delta from this column, so defaulting
	-- an unknown chart to C silently shifts chords and reference audio by
	-- whatever the real distance was.
	"song_key" varchar(12),
	"time_signature" varchar(12) NOT NULL DEFAULT '4/4',
	"tempo" integer,
	"feel" varchar(64) NOT NULL DEFAULT '',
	"ccli" varchar(32) NOT NULL DEFAULT '',
	"notes" text NOT NULL DEFAULT '',
	-- Colour-coded note cards: [{color, text, section}]. section "" is a general
	-- note pinned to the top; otherwise it anchors to that chart section.
	"note_cards" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"tags" text[] NOT NULL DEFAULT '{}',
	-- ChordPro-style body: "[G]Amazing [C]grace" with {section} directives.
	"content" text NOT NULL DEFAULT '',
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "songs_title_idx" ON "songs" ("title");

CREATE TABLE IF NOT EXISTS "setlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"service_date" date,
	"notes" text NOT NULL DEFAULT '',
	"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "setlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setlist_id" uuid NOT NULL REFERENCES "setlists"("id") ON DELETE CASCADE,
	"song_id" uuid NOT NULL REFERENCES "songs"("id") ON DELETE CASCADE,
	"position" integer NOT NULL DEFAULT 0,
	-- Per-performance key. NULL means "play it in the song's own key".
	"key_override" varchar(12),
	-- Per-performance pitch offset for the reference track, in semitones.
	-- NULL means "use the recording's own saved tune" (song_audio.tune_offset).
	"tune_offset" smallint,
	"notes" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "setlist_items_setlist_idx" ON "setlist_items" ("setlist_id", "position");

-- One reference recording per song. The bytes live in Supabase Storage; this
-- table only holds the pointer, so the row count is what the upload cap counts.
CREATE TABLE IF NOT EXISTS "song_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL UNIQUE REFERENCES "songs"("id") ON DELETE CASCADE,
	"storage_path" text NOT NULL,
	"filename" varchar(255) NOT NULL DEFAULT '',
	"size_bytes" bigint NOT NULL DEFAULT 0,
	-- Saved pitch offset in semitones, applied on playback. 0 = original pitch.
	"tune_offset" smallint NOT NULL DEFAULT 0,
	"uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
