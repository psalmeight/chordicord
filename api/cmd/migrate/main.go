// Command migrate applies the schema. With -schema it runs db/schema.sql
// against a fresh database; otherwise it runs the incremental migrations.
package main

import (
	"flag"
	"log"
	"os"

	"transcode/api/config"
	"transcode/api/db"
)

func main() {
	useSchema := flag.Bool("schema", false, "apply db/schema.sql for a fresh database")
	flag.Parse()

	cfg := config.Load()
	database := db.Connect(cfg.DatabaseURL)
	defer database.Close()

	if *useSchema {
		sql, err := os.ReadFile("db/schema.sql")
		if err != nil {
			log.Fatalf("Failed to read db/schema.sql: %v", err)
		}
		if _, err := database.Exec(string(sql)); err != nil {
			log.Fatalf("Failed to apply schema: %v", err)
		}
		log.Println("Schema applied.")
	}

	db.Migrate(database)
	log.Println("Migrations applied.")
}
