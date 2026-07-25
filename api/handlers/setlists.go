package handlers

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"transcode/api/middleware"
	"transcode/api/models"
)

func ListSetlists(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		setlists := []models.Setlist{}
		err := database.Select(&setlists,
			`SELECT id, name, service_date, notes, created_by, created_at, updated_at
			 FROM setlists ORDER BY COALESCE(service_date, created_at::date) DESC, created_at DESC`)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load setlists"})
			return
		}
		c.JSON(200, setlists)
	}
}

// GetSetlist returns the setlist with its items and each item's full song
// content, so the live view needs exactly one request.
func GetSetlist(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var setlist models.Setlist
		err := database.Get(&setlist,
			`SELECT id, name, service_date, notes, created_by, created_at, updated_at
			 FROM setlists WHERE id = $1`, id)
		if err != nil {
			c.JSON(404, gin.H{"error": "Setlist not found"})
			return
		}

		items := []models.SetlistItem{}
		err = database.Select(&items, `
			SELECT i.id, i.setlist_id, i.song_id, i.position, i.key_override, i.tune_offset, i.notes,
			       s.title, s.artist, s.song_key, s.time_signature, s.tempo, s.feel, s.content, s.note_cards,
			       (a.song_id IS NOT NULL) AS has_audio,
			       COALESCE(a.tune_offset, 0) AS audio_tune_offset
			FROM setlist_items i
			JOIN songs s ON s.id = i.song_id
			LEFT JOIN song_audio a ON a.song_id = i.song_id
			WHERE i.setlist_id = $1
			ORDER BY i.position`, id)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load setlist items"})
			return
		}

		c.JSON(200, gin.H{"setlist": setlist, "items": items})
	}
}

func CreateSetlist(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body struct {
			Name        string  `json:"name"`
			ServiceDate *string `json:"serviceDate"`
			Notes       string  `json:"notes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			c.JSON(400, gin.H{"error": "Name is required"})
			return
		}

		var setlist models.Setlist
		err := database.Get(&setlist, `
			INSERT INTO setlists (name, service_date, notes, created_by)
			VALUES ($1, $2, $3, $4)
			RETURNING id, name, service_date, notes, created_by, created_at, updated_at`,
			strings.TrimSpace(body.Name), body.ServiceDate, body.Notes, user.ID)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to create setlist"})
			return
		}
		c.JSON(201, setlist)
	}
}

func UpdateSetlist(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name        *string `json:"name"`
			ServiceDate *string `json:"serviceDate"`
			Notes       *string `json:"notes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}

		var setlist models.Setlist
		err := database.Get(&setlist, `
			UPDATE setlists SET
				name         = COALESCE($1, name),
				service_date = COALESCE($2::date, service_date),
				notes        = COALESCE($3, notes),
				updated_at   = NOW()
			WHERE id = $4
			RETURNING id, name, service_date, notes, created_by, created_at, updated_at`,
			body.Name, body.ServiceDate, body.Notes, c.Param("id"))
		if err != nil {
			c.JSON(404, gin.H{"error": "Setlist not found"})
			return
		}
		c.JSON(200, setlist)
	}
}

func DeleteSetlist(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		res, err := database.Exec(`DELETE FROM setlists WHERE id = $1`, c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to delete setlist"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "Setlist not found"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func AddSetlistItem(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		setlistID := c.Param("id")
		var body struct {
			SongID      string  `json:"songId"`
			KeyOverride *string `json:"keyOverride"`
			Notes       string  `json:"notes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.SongID == "" {
			c.JSON(400, gin.H{"error": "songId is required"})
			return
		}

		var id string
		err := database.QueryRowx(`
			INSERT INTO setlist_items (setlist_id, song_id, position, key_override, notes)
			VALUES ($1, $2,
			        (SELECT COALESCE(MAX(position), -1) + 1 FROM setlist_items WHERE setlist_id = $1),
			        $3, $4)
			RETURNING id`,
			setlistID, body.SongID, body.KeyOverride, body.Notes).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": "Failed to add song to setlist"})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

func UpdateSetlistItem(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			KeyOverride *string `json:"keyOverride"`
			ClearKey    bool    `json:"clearKey"`
			// nil leaves the tune override untouched; ClearTune resets it to the
			// recording's own saved tune, mirroring ClearKey for key_override.
			TuneOffset *int    `json:"tuneOffset"`
			ClearTune  bool    `json:"clearTune"`
			Notes      *string `json:"notes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		_, err := database.Exec(`
			UPDATE setlist_items SET
				key_override = CASE WHEN $1 THEN NULL ELSE COALESCE($2, key_override) END,
				tune_offset  = CASE WHEN $3 THEN NULL ELSE COALESCE($4, tune_offset) END,
				notes        = COALESCE($5, notes)
			WHERE id = $6 AND setlist_id = $7`,
			body.ClearKey, body.KeyOverride, body.ClearTune, body.TuneOffset,
			body.Notes, c.Param("itemId"), c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to update item"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func DeleteSetlistItem(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, err := database.Exec(`DELETE FROM setlist_items WHERE id = $1 AND setlist_id = $2`,
			c.Param("itemId"), c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to remove item"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

// ReorderSetlist rewrites every position in one transaction from the ordered
// list of item ids the client sends.
func ReorderSetlist(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		setlistID := c.Param("id")
		var body struct {
			ItemIDs []string `json:"itemIds"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}

		tx, err := database.Beginx()
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		defer tx.Rollback()

		for i, itemID := range body.ItemIDs {
			if _, err := tx.Exec(
				`UPDATE setlist_items SET position = $1 WHERE id = $2 AND setlist_id = $3`,
				i, itemID, setlistID); err != nil {
				c.JSON(500, gin.H{"error": "Failed to reorder"})
				return
			}
		}
		if err := tx.Commit(); err != nil {
			c.JSON(500, gin.H{"error": "Failed to reorder"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}
