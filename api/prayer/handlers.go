package prayer

import (
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jmoiron/sqlx"

	"transcode/api/middleware"
)

const (
	categoryColumns = `id, name, created_at, updated_at`
	prayerColumns   = `id, category_id, title, details, created_at, updated_at`
)

// pgCode returns the Postgres error code behind err, or "".
func pgCode(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code
	}
	return ""
}

// badCategory reports whether err means the given category_id doesn't point
// at a category: a foreign key miss (23503) or not a uuid at all (22P02).
func badCategory(err error) bool {
	code := pgCode(err)
	return code == "23503" || code == "22P02"
}

// ---- Categories -------------------------------------------------------------

func ListCategories(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		categories := []Category{}
		err := database.Select(&categories,
			`SELECT `+categoryColumns+` FROM prayer.categories ORDER BY lower(name)`)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load categories"})
			return
		}
		c.JSON(200, categories)
	}
}

func CreateCategory(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body struct {
			Name string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			c.JSON(400, gin.H{"error": "Name is required"})
			return
		}

		var category Category
		err := database.Get(&category, `
			INSERT INTO prayer.categories (name, created_by)
			VALUES ($1, $2)
			RETURNING `+categoryColumns,
			strings.TrimSpace(body.Name), user.ID)
		if err != nil {
			if pgCode(err) == "23505" {
				c.JSON(400, gin.H{"error": "A category with that name already exists"})
				return
			}
			c.JSON(500, gin.H{"error": "Failed to create category"})
			return
		}
		c.JSON(201, category)
	}
}

func UpdateCategory(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			c.JSON(400, gin.H{"error": "Name is required"})
			return
		}

		var category Category
		err := database.Get(&category, `
			UPDATE prayer.categories SET name = $1, updated_at = NOW()
			WHERE id = $2
			RETURNING `+categoryColumns,
			strings.TrimSpace(body.Name), c.Param("id"))
		if err != nil {
			if pgCode(err) == "23505" {
				c.JSON(400, gin.H{"error": "A category with that name already exists"})
				return
			}
			c.JSON(404, gin.H{"error": "Category not found"})
			return
		}
		c.JSON(200, category)
	}
}

// DeleteCategory removes the category only; its prayers stay and become
// uncategorized (the foreign key is ON DELETE SET NULL).
func DeleteCategory(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		res, err := database.Exec(`DELETE FROM prayer.categories WHERE id = $1`, c.Param("id"))
		if err != nil {
			if pgCode(err) == "22P02" {
				c.JSON(404, gin.H{"error": "Category not found"})
				return
			}
			c.JSON(500, gin.H{"error": "Failed to delete category"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "Category not found"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

// ---- Prayers ----------------------------------------------------------------

// ListPrayers returns every prayer, newest first. ?category=<id> narrows to
// one category and ?category=none to the uncategorized ones.
func ListPrayers(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := `SELECT ` + prayerColumns + ` FROM prayer.prayers`
		args := []any{}
		switch cat := c.Query("category"); cat {
		case "":
		case "none":
			query += ` WHERE category_id IS NULL`
		default:
			query += ` WHERE category_id = $1`
			args = append(args, cat)
		}
		query += ` ORDER BY created_at DESC`

		prayers := []Prayer{}
		if err := database.Select(&prayers, query, args...); err != nil {
			if pgCode(err) == "22P02" {
				c.JSON(400, gin.H{"error": "Invalid category"})
				return
			}
			c.JSON(500, gin.H{"error": "Failed to load prayers"})
			return
		}
		c.JSON(200, prayers)
	}
}

func CreatePrayer(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body struct {
			Title string `json:"title"`
			// nil or "" means uncategorized.
			CategoryID *string `json:"categoryId"`
			Details    string  `json:"details"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Title) == "" {
			c.JSON(400, gin.H{"error": "Title is required"})
			return
		}
		if body.CategoryID != nil && *body.CategoryID == "" {
			body.CategoryID = nil
		}

		var prayer Prayer
		err := database.Get(&prayer, `
			INSERT INTO prayer.prayers (category_id, title, details, created_by, updated_by)
			VALUES ($1, $2, $3, $4, $4)
			RETURNING `+prayerColumns,
			body.CategoryID, strings.TrimSpace(body.Title), body.Details, user.ID)
		if err != nil {
			if badCategory(err) {
				c.JSON(400, gin.H{"error": "Category not found"})
				return
			}
			c.JSON(500, gin.H{"error": "Failed to create prayer"})
			return
		}
		c.JSON(201, prayer)
	}
}

func UpdatePrayer(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body struct {
			Title      *string `json:"title"`
			Details    *string `json:"details"`
			CategoryID *string `json:"categoryId"`
			// category_id is nullable, so COALESCE can't say "take it away".
			// ClearCategory is the explicit flag, as on users.username.
			ClearCategory bool `json:"clearCategory"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if body.Title != nil {
			t := strings.TrimSpace(*body.Title)
			if t == "" {
				c.JSON(400, gin.H{"error": "Title is required"})
				return
			}
			body.Title = &t
		}
		if body.CategoryID != nil && *body.CategoryID == "" {
			body.CategoryID = nil
			body.ClearCategory = true
		}

		var prayer Prayer
		err := database.Get(&prayer, `
			UPDATE prayer.prayers SET
				title       = COALESCE($1, title),
				details     = COALESCE($2, details),
				category_id = CASE WHEN $3 THEN NULL ELSE COALESCE($4::uuid, category_id) END,
				updated_by  = $5,
				updated_at  = NOW()
			WHERE id = $6
			RETURNING `+prayerColumns,
			body.Title, body.Details, body.ClearCategory, body.CategoryID, user.ID, c.Param("id"))
		if err != nil {
			// A bad prayer id and a bad category id both surface as 22P02;
			// the category is the one the caller chose, so blame that when
			// one was given.
			if body.CategoryID != nil && badCategory(err) {
				c.JSON(400, gin.H{"error": "Category not found"})
				return
			}
			c.JSON(404, gin.H{"error": "Prayer not found"})
			return
		}
		c.JSON(200, prayer)
	}
}

func DeletePrayer(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		res, err := database.Exec(`DELETE FROM prayer.prayers WHERE id = $1`, c.Param("id"))
		if err != nil {
			if pgCode(err) == "22P02" {
				c.JSON(404, gin.H{"error": "Prayer not found"})
				return
			}
			c.JSON(500, gin.H{"error": "Failed to delete prayer"})
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			c.JSON(404, gin.H{"error": "Prayer not found"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}
