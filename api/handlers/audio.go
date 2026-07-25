package handlers

import (
	"database/sql"
	"errors"
	"log"
	"path"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"transcode/api/config"
	"transcode/api/middleware"
	"transcode/api/models"
	"transcode/api/storage"
)

// Playback URLs expire after an hour — long enough to get through a rehearsal,
// short enough that a leaked URL isn't a permanent public mirror of the track.
const audioURLTTL = 3600

// maxAudioBytes bounds a single upload. 20MB comfortably holds a 10-minute
// song at 256kbps; past that someone is uploading the wrong kind of file.
const maxAudioBytes = 20 << 20

const audioListSelect = `
	SELECT a.id, a.song_id, a.storage_path, a.filename, a.size_bytes, a.uploaded_by,
	       a.created_at, s.title, s.artist, u.name AS uploaded_by_name
	FROM song_audio a
	JOIN songs s ON s.id = a.song_id
	LEFT JOIN users u ON u.id = a.uploaded_by`

func storageUnavailable(c *gin.Context) {
	c.JSON(503, gin.H{"error": "Audio storage is not configured on this server"})
}

// ListAudio backs the library manager: every uploaded track, oldest first, so
// the list doubles as the "what should I delete" view when the cap is hit.
func ListAudio(database *sqlx.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		items := []models.AudioListItem{}
		if err := database.Select(&items, audioListSelect+` ORDER BY a.created_at`); err != nil {
			c.JSON(500, gin.H{"error": "Failed to load audio"})
			return
		}
		c.JSON(200, gin.H{"items": items, "limit": cfg.MaxAudioUploads, "used": len(items)})
	}
}

// CreateAudioUploadURL enforces the library cap and hands back a signed URL the
// browser PUTs the file to directly.
//
// The cap is checked here rather than at confirm time so a user is told "no"
// before spending minutes uploading. Replacing a song's own existing track is
// always allowed — it's a swap, not a net addition.
func CreateAudioUploadURL(database *sqlx.DB, store *storage.Client, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !store.Configured() {
			storageUnavailable(c)
			return
		}
		songID := c.Param("id")

		var body struct {
			Filename string `json:"filename"`
			Size     int64  `json:"size"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if body.Size > maxAudioBytes {
			c.JSON(413, gin.H{"error": "That file is larger than the 20MB limit"})
			return
		}
		if !strings.EqualFold(path.Ext(body.Filename), ".mp3") {
			c.JSON(400, gin.H{"error": "Only .mp3 files are supported"})
			return
		}

		var exists bool
		if err := database.Get(&exists, `SELECT EXISTS(SELECT 1 FROM songs WHERE id = $1)`, songID); err != nil || !exists {
			c.JSON(404, gin.H{"error": "Song not found"})
			return
		}

		var replacing bool
		if err := database.Get(&replacing,
			`SELECT EXISTS(SELECT 1 FROM song_audio WHERE song_id = $1)`, songID); err != nil {
			c.JSON(500, gin.H{"error": "Failed to check existing audio"})
			return
		}

		if !replacing {
			var used int
			if err := database.Get(&used, `SELECT COUNT(*) FROM song_audio`); err != nil {
				c.JSON(500, gin.H{"error": "Failed to check the audio limit"})
				return
			}
			if used >= cfg.MaxAudioUploads {
				c.JSON(409, gin.H{
					"error": "The library is at its limit of " + strconv.Itoa(cfg.MaxAudioUploads) +
						" uploaded tracks. Remove one before adding another.",
					"limit": cfg.MaxAudioUploads,
					"used":  used,
				})
				return
			}
		}

		// Path is derived from the song, so re-uploading overwrites in place
		// rather than orphaning the previous object.
		storagePath := songID + ".mp3"
		url, err := store.SignedUploadURL(storagePath)
		if err != nil {
			log.Printf("audio: sign upload for song %s: %v", songID, err)
			c.JSON(502, gin.H{"error": "Could not start the upload"})
			return
		}
		c.JSON(200, gin.H{"uploadUrl": url, "path": storagePath})
	}
}

// ConfirmAudio records the row after the browser reports a successful upload.
// It re-checks the object with a HEAD first, so a failed or spoofed upload
// can't leave a row pointing at nothing.
func ConfirmAudio(database *sqlx.DB, store *storage.Client, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !store.Configured() {
			storageUnavailable(c)
			return
		}
		user := middleware.GetUser(c)
		songID := c.Param("id")

		var body struct {
			Filename string `json:"filename"`
		}
		_ = c.ShouldBindJSON(&body)

		storagePath := songID + ".mp3"
		size, err := store.Stat(storagePath)
		if err != nil {
			log.Printf("audio: stat %s: %v", storagePath, err)
			c.JSON(400, gin.H{"error": "The upload did not complete"})
			return
		}

		var audio models.SongAudio
		err = database.Get(&audio, `
			INSERT INTO song_audio (song_id, storage_path, filename, size_bytes, uploaded_by)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (song_id) DO UPDATE SET
				storage_path = EXCLUDED.storage_path,
				filename     = EXCLUDED.filename,
				size_bytes   = EXCLUDED.size_bytes,
				uploaded_by  = EXCLUDED.uploaded_by,
				created_at   = NOW()
			RETURNING id, song_id, storage_path, filename, size_bytes, tune_offset, uploaded_by, created_at`,
			songID, storagePath, strings.TrimSpace(body.Filename), size, user.ID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to save the track"})
			return
		}
		c.JSON(201, audio)
	}
}

// GetAudio returns a fresh signed playback URL. Nothing about the object is
// cacheable client-side, so the URL is minted per request.
func GetAudio(database *sqlx.DB, store *storage.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var audio models.SongAudio
		err := database.Get(&audio, `
			SELECT id, song_id, storage_path, filename, size_bytes, tune_offset, uploaded_by, created_at
			FROM song_audio WHERE song_id = $1`, c.Param("id"))
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(404, gin.H{"error": "No audio for this song"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load audio"})
			return
		}
		if !store.Configured() {
			storageUnavailable(c)
			return
		}

		url, err := store.SignedDownloadURL(audio.StoragePath, audioURLTTL)
		if err != nil {
			log.Printf("audio: sign download %s: %v", audio.StoragePath, err)
			c.JSON(502, gin.H{"error": "Could not load the track"})
			return
		}
		c.JSON(200, gin.H{
			"id":         audio.ID,
			"songId":     audio.SongID,
			"filename":   audio.Filename,
			"sizeBytes":  audio.SizeBytes,
			"tuneOffset": audio.TuneOffset,
			"createdAt":  audio.CreatedAt,
			"url":        url,
			"expiresIn":  audioURLTTL,
		})
	}
}

// maxTuneShift bounds a saved pitch offset. Past an octave the shift is more
// re-recording than reference, and the artefacts make it useless as a guide.
const maxTuneShift = 12

// UpdateAudioTune saves the reference track's pitch offset so every viewer,
// and any setlist that doesn't override it, plays along at the same pitch.
func UpdateAudioTune(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			TuneOffset int `json:"tuneOffset"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if body.TuneOffset < -maxTuneShift || body.TuneOffset > maxTuneShift {
			c.JSON(400, gin.H{"error": "Tune offset is out of range"})
			return
		}

		res, err := database.Exec(
			`UPDATE song_audio SET tune_offset = $1 WHERE song_id = $2`,
			body.TuneOffset, c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to save the tune"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "No audio for this song"})
			return
		}
		c.JSON(200, gin.H{"ok": true, "tuneOffset": body.TuneOffset})
	}
}

// DeleteAudio frees a slot. The row goes first: if the storage delete fails we
// have an orphaned object (recoverable, costs a little space) rather than a row
// pointing at a file that's gone (breaks playback for everyone).
func DeleteAudio(database *sqlx.DB, store *storage.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var storagePath string
		err := database.Get(&storagePath,
			`DELETE FROM song_audio WHERE song_id = $1 RETURNING storage_path`, c.Param("id"))
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(404, gin.H{"error": "No audio for this song"})
			return
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to remove the track"})
			return
		}

		if store.Configured() {
			if err := store.Remove(storagePath); err != nil {
				log.Printf("audio: orphaned object %s: %v", storagePath, err)
			}
		}
		c.JSON(200, gin.H{"ok": true})
	}
}
