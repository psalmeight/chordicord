package handlers

import (
	"log"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"transcode/api/middleware"
	"transcode/api/models"
	"transcode/api/storage"
)

const songSelect = `
	SELECT s.id, s.title, s.artist, s.song_key, s.time_signature, s.tempo, s.feel,
	       s.ccli, s.notes, s.note_cards, s.tags, s.content, s.chart_columns, s.created_by, s.updated_by,
	       s.created_at, s.updated_at, u.name AS updated_by_name,
	       EXISTS(SELECT 1 FROM song_audio a WHERE a.song_id = s.id) AS has_audio
	FROM songs s
	LEFT JOIN users u ON u.id = s.updated_by`

type songBody struct {
	Title         *string           `json:"title"`
	Artist        *string           `json:"artist"`
	Key           *string           `json:"key"`
	TimeSignature *string           `json:"timeSignature"`
	Tempo         *int              `json:"tempo"`
	Feel          *string           `json:"feel"`
	CCLI          *string           `json:"ccli"`
	Notes         *string           `json:"notes"`
	NoteCards     *models.NoteCards `json:"noteCards"`
	Tags          *[]string         `json:"tags"`
	Content       *string           `json:"content"`
	ChartColumns  *int              `json:"chartColumns"`
}

// chartColumnsValid rejects anything but the two layouts the chart renders.
func chartColumnsValid(v *int) bool {
	return v == nil || *v == 1 || *v == 2
}

func ListSongs(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		q := strings.TrimSpace(c.Query("q"))
		tag := strings.TrimSpace(c.Query("tag"))

		// Content is deliberately excluded from the list payload — song bodies
		// are large and the index only renders metadata.
		query := `
			SELECT s.id, s.title, s.artist, s.song_key, s.time_signature, s.tempo, s.feel,
			       s.ccli, s.notes, s.note_cards, s.tags, '' AS content, s.chart_columns, s.created_by, s.updated_by,
			       s.created_at, s.updated_at, u.name AS updated_by_name,
			       EXISTS(SELECT 1 FROM song_audio a WHERE a.song_id = s.id) AS has_audio
			FROM songs s
			LEFT JOIN users u ON u.id = s.updated_by
			WHERE ($1 = '' OR s.title ILIKE '%' || $1 || '%' OR s.artist ILIKE '%' || $1 || '%')
			  AND ($2 = '' OR $2 = ANY(s.tags))
			ORDER BY s.title`

		songs := []models.SongWithAuthor{}
		if err := database.Select(&songs, query, q, tag); err != nil {
			c.JSON(500, gin.H{"error": "Failed to load songs"})
			return
		}
		c.JSON(200, songs)
	}
}

func GetSong(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var song models.SongWithAuthor
		if err := database.Get(&song, songSelect+` WHERE s.id = $1`, c.Param("id")); err != nil {
			c.JSON(404, gin.H{"error": "Song not found"})
			return
		}
		c.JSON(200, song)
	}
}

func CreateSong(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body songBody
		if err := c.ShouldBindJSON(&body); err != nil || body.Title == nil || strings.TrimSpace(*body.Title) == "" {
			c.JSON(400, gin.H{"error": "Title is required"})
			return
		}
		if !chartColumnsValid(body.ChartColumns) {
			c.JSON(400, gin.H{"error": "chartColumns must be 1 or 2"})
			return
		}

		tags := pq.StringArray{}
		if body.Tags != nil {
			tags = pq.StringArray(*body.Tags)
		}
		var noteCards interface{}
		if body.NoteCards != nil {
			noteCards = *body.NoteCards
		}

		var id string
		err := database.QueryRowx(`
			INSERT INTO songs (title, artist, song_key, time_signature, tempo, feel, ccli, notes, note_cards, tags, content, chart_columns, created_by, updated_by)
			VALUES ($1, COALESCE($2,''), $3, COALESCE($4,'4/4'), $5, COALESCE($6,''),
			        COALESCE($7,''), COALESCE($8,''), COALESCE($9::jsonb,'[]'::jsonb), $10, COALESCE($11,''), COALESCE($13,1), $12, $12)
			RETURNING id`,
			strings.TrimSpace(*body.Title), body.Artist, body.Key, body.TimeSignature, body.Tempo,
			body.Feel, body.CCLI, body.Notes, noteCards, tags, body.Content, user.ID, body.ChartColumns).Scan(&id)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to create song"})
			return
		}

		var song models.SongWithAuthor
		if err := database.Get(&song, songSelect+` WHERE s.id = $1`, id); err != nil {
			c.JSON(500, gin.H{"error": "Failed to load song"})
			return
		}
		c.JSON(201, song)
	}
}

// UpdateSong patches only the fields present in the body — COALESCE against
// the existing column keeps omitted fields untouched.
func UpdateSong(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		id := c.Param("id")

		var body songBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if !chartColumnsValid(body.ChartColumns) {
			c.JSON(400, gin.H{"error": "chartColumns must be 1 or 2"})
			return
		}

		var tags interface{}
		if body.Tags != nil {
			tags = pq.StringArray(*body.Tags)
		}
		var noteCards interface{}
		if body.NoteCards != nil {
			noteCards = *body.NoteCards
		}
		// Tempo is nullable, so COALESCE can't distinguish "omitted" from
		// "cleared". A separate flag makes the intent explicit.
		clearTempo := body.Tempo == nil && c.Request.URL.Query().Get("clearTempo") == "1"
		// Same for the key, which became nullable so "unknown" stays sayable —
		// without this an editor could set a key but never take it back off.
		clearKey := body.Key == nil && c.Request.URL.Query().Get("clearKey") == "1"

		var song models.SongWithAuthor
		err := database.Get(&song, `
			WITH updated AS (
				UPDATE songs SET
					title          = COALESCE($1, title),
					artist         = COALESCE($2, artist),
					song_key       = CASE WHEN $14 THEN NULL ELSE COALESCE($3, song_key) END,
					time_signature = COALESCE($4, time_signature),
					tempo          = CASE WHEN $5 THEN NULL ELSE COALESCE($6, tempo) END,
					feel           = COALESCE($7, feel),
					ccli           = COALESCE($8, ccli),
					notes          = COALESCE($9, notes),
					note_cards     = COALESCE($15::jsonb, note_cards),
					tags           = COALESCE($10, tags),
					content        = COALESCE($11, content),
					chart_columns  = COALESCE($16, chart_columns),
					updated_by     = $12,
					updated_at     = NOW()
				WHERE id = $13
				RETURNING *
			)
			SELECT s.id, s.title, s.artist, s.song_key, s.time_signature, s.tempo, s.feel,
			       s.ccli, s.notes, s.note_cards, s.tags, s.content, s.chart_columns, s.created_by, s.updated_by,
			       s.created_at, s.updated_at, u.name AS updated_by_name,
			       EXISTS(SELECT 1 FROM song_audio a WHERE a.song_id = s.id) AS has_audio
			FROM updated s LEFT JOIN users u ON u.id = s.updated_by`,
			body.Title, body.Artist, body.Key, body.TimeSignature, clearTempo, body.Tempo,
			body.Feel, body.CCLI, body.Notes, tags, body.Content, user.ID, id, clearKey, noteCards,
			body.ChartColumns)
		if err != nil {
			c.JSON(404, gin.H{"error": "Song not found"})
			return
		}
		c.JSON(200, song)
	}
}

func DeleteSong(database *sqlx.DB, store *storage.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		// The song_audio row cascades away with the song, so read its storage
		// path first — otherwise the object is orphaned and keeps consuming a
		// slot's worth of space with nothing left pointing at it.
		var storagePath string
		hasAudio := database.Get(&storagePath,
			`SELECT storage_path FROM song_audio WHERE song_id = $1`, c.Param("id")) == nil

		res, err := database.Exec(`DELETE FROM songs WHERE id = $1`, c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to delete song"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "Song not found"})
			return
		}
		if hasAudio && store.Configured() {
			if err := store.Remove(storagePath); err != nil {
				log.Printf("songs: orphaned audio object %s: %v", storagePath, err)
			}
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

// ListTags powers the filter chips on the song index.
func ListTags(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tags := []string{}
		if err := database.Select(&tags,
			`SELECT DISTINCT unnest(tags) AS tag FROM songs ORDER BY tag`); err != nil {
			c.JSON(500, gin.H{"error": "Failed to load tags"})
			return
		}
		c.JSON(200, tags)
	}
}
