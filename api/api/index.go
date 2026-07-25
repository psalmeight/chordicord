// Package handler is the Vercel serverless entrypoint. Vercel requires a file
// under /api exporting Handler; the engine is built once per cold start.
package handler

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"

	"transcode/api/config"
	"transcode/api/db"
	"transcode/api/router"
)

var (
	app  *gin.Engine
	once sync.Once
)

func boot() {
	gin.SetMode(gin.ReleaseMode)
	cfg := config.Load()
	database := db.Connect(cfg.DatabaseURL)
	db.Migrate(database)
	app = router.New(database, cfg)
}

func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(boot)
	app.ServeHTTP(w, r)
}
