package handlers

import (
	"database/sql"
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

// GetSetlist returns the setlist with its items — each item's own snapshot of
// the song plus the requesting user's private prefs — so the live view needs
// exactly one request.
func GetSetlist(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		user := middleware.GetUser(c)

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
			       i.title, i.artist, i.song_key, i.time_signature, i.tempo, i.feel, i.content, i.note_cards,
			       i.chart_columns,
			       (a.song_id IS NOT NULL) AS has_audio,
			       COALESCE(a.tune_offset, 0) AS audio_tune_offset,
			       COALESCE(p.capo, 0) AS my_capo,
			       COALESCE(p.notes, '') AS my_notes
			FROM setlist_items i
			LEFT JOIN song_audio a ON a.song_id = i.song_id
			LEFT JOIN setlist_item_prefs p ON p.setlist_item_id = i.id AND p.user_id = $2
			WHERE i.setlist_id = $1
			ORDER BY i.position`, id, user.ID)
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

// AddSetlistItem snapshots the song into the item in one statement — from this
// moment the item is an independent copy the setlist owns.
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
			INSERT INTO setlist_items
				(setlist_id, song_id, position, key_override, notes,
				 title, artist, song_key, time_signature, tempo, feel, content, note_cards, chart_columns)
			SELECT $1, s.id,
			       (SELECT COALESCE(MAX(position), -1) + 1 FROM setlist_items WHERE setlist_id = $1),
			       $3, $4,
			       s.title, s.artist, s.song_key, s.time_signature, s.tempo, s.feel, s.content, s.note_cards, s.chart_columns
			FROM songs s WHERE s.id = $2
			RETURNING id`,
			setlistID, body.SongID, body.KeyOverride, body.Notes).Scan(&id)
		if err == sql.ErrNoRows {
			c.JSON(404, gin.H{"error": "Song not found"})
			return
		}
		if err != nil {
			c.JSON(400, gin.H{"error": "Failed to add song to setlist"})
			return
		}
		c.JSON(201, gin.H{"id": id})
	}
}

// UpdateSetlistItem patches the item — the per-performance overrides and the
// item's own copy of the song. Nothing here ever writes to the songbank.
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
			// Edits to the item's snapshot copy. Nullable columns carry an
			// explicit Clear* flag because COALESCE can't say "set to NULL".
			Title         *string           `json:"title"`
			Artist        *string           `json:"artist"`
			SongKey       *string           `json:"songKey"`
			ClearSongKey  bool              `json:"clearSongKey"`
			TimeSignature *string           `json:"timeSignature"`
			Tempo         *int              `json:"tempo"`
			ClearTempo    bool              `json:"clearTempo"`
			Feel          *string           `json:"feel"`
			Content       *string           `json:"content"`
			NoteCards     *models.NoteCards `json:"noteCards"`
			ChartColumns  *int              `json:"chartColumns"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if !chartColumnsValid(body.ChartColumns) {
			c.JSON(400, gin.H{"error": "chartColumns must be 1 or 2"})
			return
		}
		var noteCards interface{}
		if body.NoteCards != nil {
			noteCards = *body.NoteCards
		}
		_, err := database.Exec(`
			UPDATE setlist_items SET
				key_override   = CASE WHEN $1 THEN NULL ELSE COALESCE($2, key_override) END,
				tune_offset    = CASE WHEN $3 THEN NULL ELSE COALESCE($4, tune_offset) END,
				notes          = COALESCE($5, notes),
				title          = COALESCE($6, title),
				artist         = COALESCE($7, artist),
				song_key       = CASE WHEN $8 THEN NULL ELSE COALESCE($9, song_key) END,
				time_signature = COALESCE($10, time_signature),
				tempo          = CASE WHEN $11 THEN NULL ELSE COALESCE($12, tempo) END,
				feel           = COALESCE($13, feel),
				content        = COALESCE($14, content),
				note_cards     = COALESCE($15::jsonb, note_cards),
				chart_columns  = COALESCE($16, chart_columns)
			WHERE id = $17 AND setlist_id = $18`,
			body.ClearKey, body.KeyOverride, body.ClearTune, body.TuneOffset, body.Notes,
			body.Title, body.Artist, body.ClearSongKey, body.SongKey, body.TimeSignature,
			body.ClearTempo, body.Tempo, body.Feel, body.Content, noteCards, body.ChartColumns,
			c.Param("itemId"), c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to update item"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

// ResyncSetlistItem re-pulls the songbank song into the item's snapshot,
// discarding the setlist's edits to it (including the key override). The
// per-performance tune and everyone's personal prefs survive.
func ResyncSetlistItem(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		res, err := database.Exec(`
			UPDATE setlist_items i SET
				title = s.title, artist = s.artist, song_key = s.song_key,
				time_signature = s.time_signature, tempo = s.tempo, feel = s.feel,
				content = s.content, note_cards = s.note_cards,
				chart_columns = s.chart_columns,
				key_override = NULL
			FROM songs s
			WHERE i.id = $1 AND i.setlist_id = $2 AND s.id = i.song_id`,
			c.Param("itemId"), c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to update from songbank"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "This song is no longer in the songbank"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

// UpsertItemPrefs saves the requesting user's own capo and private note for
// one item. Any role may call it — the row is scoped to the caller, so nobody
// can touch anyone else's prefs.
func UpsertItemPrefs(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body struct {
			Capo  *int    `json:"capo"`
			Notes *string `json:"notes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if body.Capo != nil && (*body.Capo < 0 || *body.Capo > 11) {
			c.JSON(400, gin.H{"error": "Capo must be between 0 and 11"})
			return
		}

		// The INSERT ... SELECT proves the item belongs to the setlist in the
		// URL; zero rows means a bad or foreign item id.
		res, err := database.Exec(`
			INSERT INTO setlist_item_prefs (setlist_item_id, user_id, capo, notes)
			SELECT i.id, $2, COALESCE($3, 0), COALESCE($4, '')
			  FROM setlist_items i WHERE i.id = $1 AND i.setlist_id = $5
			ON CONFLICT (setlist_item_id, user_id) DO UPDATE SET
				capo       = COALESCE($3, setlist_item_prefs.capo),
				notes      = COALESCE($4, setlist_item_prefs.notes),
				updated_at = NOW()`,
			c.Param("itemId"), user.ID, body.Capo, body.Notes, c.Param("id"))
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to save preferences"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "Setlist item not found"})
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
