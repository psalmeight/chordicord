package main

import (
	"log"

	"transcode/api/config"
	"transcode/api/db"
	"transcode/api/router"
)

func main() {
	cfg := config.Load()

	database := db.Connect(cfg.DatabaseURL)
	defer database.Close()
	db.Migrate(database)

	r := router.New(database, cfg)
	log.Printf("transcode api listening on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
