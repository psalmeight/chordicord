package models

import (
	"time"

	"github.com/lib/pq"
)

type User struct {
	ID           string     `db:"id" json:"id"`
	Email        string     `db:"email" json:"email"`
	PasswordHash string     `db:"password_hash" json:"-"`
	Name         string     `db:"name" json:"name"`
	Role         string     `db:"role" json:"role"`
	VerifiedAt   *time.Time `db:"verified_at" json:"verifiedAt"`
	CreatedAt    time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updatedAt"`
}

type Song struct {
	ID     string `db:"id" json:"id"`
	Title  string `db:"title" json:"title"`
	Artist string `db:"artist" json:"artist"`
	// nil when the key hasn't been established — never coerced to "C".
	SongKey       *string        `db:"song_key" json:"key"`
	TimeSignature string         `db:"time_signature" json:"timeSignature"`
	Tempo         *int           `db:"tempo" json:"tempo"`
	Feel          string         `db:"feel" json:"feel"`
	CCLI          string         `db:"ccli" json:"ccli"`
	Notes         string         `db:"notes" json:"notes"`
	Tags          pq.StringArray `db:"tags" json:"tags"`
	Content       string         `db:"content" json:"content"`
	CreatedBy     *string        `db:"created_by" json:"createdBy"`
	UpdatedBy     *string        `db:"updated_by" json:"updatedBy"`
	CreatedAt     time.Time      `db:"created_at" json:"createdAt"`
	UpdatedAt     time.Time      `db:"updated_at" json:"updatedAt"`
}

// SongWithAuthor is the list/detail projection — same as Song plus the
// display name of whoever touched it last.
type SongWithAuthor struct {
	Song
	UpdatedByName *string `db:"updated_by_name" json:"updatedByName"`
	HasAudio      bool    `db:"has_audio" json:"hasAudio"`
}

// SongAudio points at a reference recording in Supabase Storage. StoragePath
// is server-side detail — clients only ever get a short-lived signed URL.
type SongAudio struct {
	ID          string `db:"id" json:"id"`
	SongID      string `db:"song_id" json:"songId"`
	StoragePath string `db:"storage_path" json:"-"`
	Filename    string `db:"filename" json:"filename"`
	SizeBytes   int64  `db:"size_bytes" json:"sizeBytes"`
	// Saved playback pitch offset in semitones. 0 = the recording as uploaded.
	TuneOffset int       `db:"tune_offset" json:"tuneOffset"`
	UploadedBy *string   `db:"uploaded_by" json:"uploadedBy"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
}

// AudioListItem is the projection behind the "you're at the limit" manager —
// enough to tell one upload from another when choosing what to delete.
type AudioListItem struct {
	SongAudio
	Title          string  `db:"title" json:"title"`
	Artist         string  `db:"artist" json:"artist"`
	UploadedByName *string `db:"uploaded_by_name" json:"uploadedByName"`
}

type Setlist struct {
	ID          string     `db:"id" json:"id"`
	Name        string     `db:"name" json:"name"`
	ServiceDate *time.Time `db:"service_date" json:"serviceDate"`
	Notes       string     `db:"notes" json:"notes"`
	CreatedBy   *string    `db:"created_by" json:"createdBy"`
	CreatedAt   time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time  `db:"updated_at" json:"updatedAt"`
}

// SetlistItem carries the joined song fields so a setlist renders in one query.
type SetlistItem struct {
	ID          string  `db:"id" json:"id"`
	SetlistID   string  `db:"setlist_id" json:"setlistId"`
	SongID      string  `db:"song_id" json:"songId"`
	Position    int     `db:"position" json:"position"`
	KeyOverride *string `db:"key_override" json:"keyOverride"`
	// Per-setlist tune override; nil falls back to AudioTuneOffset.
	TuneOffset    *int    `db:"tune_offset" json:"tuneOffset"`
	Notes         string  `db:"notes" json:"notes"`
	Title         string  `db:"title" json:"title"`
	Artist        string  `db:"artist" json:"artist"`
	SongKey       *string `db:"song_key" json:"key"`
	TimeSignature string  `db:"time_signature" json:"timeSignature"`
	Tempo         *int    `db:"tempo" json:"tempo"`
	Feel          string  `db:"feel" json:"feel"`
	Content       string  `db:"content" json:"content"`
	// Joined from song_audio so the setlist view can offer play-along in one
	// query. AudioTuneOffset is the recording's own saved tune (the fallback).
	HasAudio        bool `db:"has_audio" json:"hasAudio"`
	AudioTuneOffset int  `db:"audio_tune_offset" json:"audioTuneOffset"`
}
