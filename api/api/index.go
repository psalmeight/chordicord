// Package handler is the Vercel serverless entrypoint. Vercel requires a file
// under /api exporting Handler; the engine is built once per cold start.
package handler

import (
	"net/http"
	"strings"
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

// pathParam is the query key vercel.json stuffs the original path into.
// Unlike the Node runtime, Vercel's Go runtime hands a rewritten request the
// *destination* path ("/api/index"), so without this every route 404s.
const pathParam = "__path"

func restorePath(r *http.Request) {
	q := r.URL.Query()
	if !q.Has(pathParam) {
		return
	}
	r.URL.Path = "/" + strings.TrimLeft(q.Get(pathParam), "/")
	r.URL.RawPath = ""
	q.Del(pathParam)
	r.URL.RawQuery = q.Encode()
	r.RequestURI = r.URL.RequestURI()
}

func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(boot)
	restorePath(r)
	app.ServeHTTP(w, r)
}
