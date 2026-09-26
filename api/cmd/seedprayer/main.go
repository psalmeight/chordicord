// Command seedprayer loads the FCF prayer guide leaflet (seed.json) into the
// prayer schema: one category per leaflet heading, one prayer per entry.
//
// Safe to re-run: a category that already exists (by case-insensitive name)
// is reused, and a prayer whose title already exists in its category is
// skipped, so edits made in the app are never overwritten.
package main

import (
	_ "embed"
	"encoding/json"
	"log"
	"time"

	"transcode/api/config"
	"transcode/api/db"
	"transcode/api/prayer"
)

//go:embed seed.json
var seedJSON []byte

type seedCategory struct {
	Name    string `json:"name"`
	Prayers []struct {
		Title   string `json:"title"`
		Details string `json:"details"`
	} `json:"prayers"`
}

func main() {
	var categories []seedCategory
	if err := json.Unmarshal(seedJSON, &categories); err != nil {
		log.Fatalf("Failed to parse seed.json: %v", err)
	}

	cfg := config.Load()
	database := db.Connect(cfg.DatabaseURL)
	defer database.Close()
	db.Migrate(database)
	prayer.Migrate(database)

	tx := database.MustBegin()
	defer tx.Rollback()

	// The API lists prayers newest first, so each entry is stamped a second
	// older than the one before it to keep the leaflet's order on screen.
	stamp := time.Now()
	var addedCategories, addedPrayers int

	for _, cat := range categories {
		var categoryID string
		err := tx.Get(&categoryID,
			`SELECT id FROM prayer.categories WHERE lower(name) = lower($1)`, cat.Name)
		if err != nil {
			if err := tx.Get(&categoryID,
				`INSERT INTO prayer.categories (name) VALUES ($1) RETURNING id`, cat.Name); err != nil {
				log.Fatalf("Failed to create category %q: %v", cat.Name, err)
			}
			addedCategories++
		}

		for _, p := range cat.Prayers {
			stamp = stamp.Add(-time.Second)
			res, err := tx.Exec(`
				INSERT INTO prayer.prayers (category_id, title, details, created_at, updated_at)
				SELECT $1::uuid, $2::varchar, $3::text, $4::timestamp, $4::timestamp
				WHERE NOT EXISTS (
					SELECT 1 FROM prayer.prayers WHERE category_id = $1::uuid AND title = $2::varchar
				)`,
				categoryID, p.Title, p.Details, stamp)
			if err != nil {
				log.Fatalf("Failed to create prayer %q: %v", p.Title, err)
			}
			if n, _ := res.RowsAffected(); n > 0 {
				addedPrayers++
			}
		}
	}

	if err := tx.Commit(); err != nil {
		log.Fatalf("Failed to commit seed: %v", err)
	}
	log.Printf("Prayer seed done: %d new categories, %d new prayers.", addedCategories, addedPrayers)
}
