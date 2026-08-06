package router

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"transcode/api/config"
	"transcode/api/handlers"
	"transcode/api/middleware"
	"transcode/api/storage"
)

// New is the single place routes are defined — both the local server and the
// serverless entrypoint build their engine from here.
func New(database *sqlx.DB, cfg *config.Config) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	allowed := map[string]bool{}
	for _, o := range strings.Split(cfg.WebURL, ",") {
		if o = strings.TrimSpace(strings.TrimRight(o, "/")); o != "" {
			allowed[o] = true
		}
	}
	r.Use(cors.New(cors.Config{
		AllowOriginFunc:  func(origin string) bool { return allowed[strings.TrimRight(origin, "/")] },
		AllowMethods:     []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/api/health", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	store := storage.New(cfg.SupabaseURL, cfg.SupabaseKey, cfg.SupabaseBucket)

	auth := middleware.RequireAuth(database, cfg.JWTSecret)
	adminOnly := middleware.RequireRole("admin")
	editors := middleware.RequireRole("admin", "leader")

	// Public auth endpoints.
	r.POST("/api/auth/login", handlers.Login(database, cfg.JWTSecret))
	r.POST("/api/auth/accept-invite", handlers.AcceptInvite(database, cfg))

	authed := r.Group("/api/auth")
	authed.Use(auth)
	authed.GET("/me", handlers.Me())
	authed.POST("/change-password", handlers.ChangePassword(database))

	// Songs — everyone on the team reads, leaders and admins write.
	songs := r.Group("/api/songs")
	songs.Use(auth)
	songs.GET("", handlers.ListSongs(database))
	songs.GET("/tags", handlers.ListTags(database))
	songs.GET("/:id", handlers.GetSong(database))
	songs.POST("", editors, handlers.CreateSong(database))
	songs.PATCH("/:id", editors, handlers.UpdateSong(database))
	songs.DELETE("/:id", editors, handlers.DeleteSong(database, store))
	// Reference tracks. Everyone plays along; only editors attach or remove.
	// Pitch tuning is saved per setlist item, never on the recording itself.
	songs.GET("/:id/audio", handlers.GetAudio(database, store))
	songs.POST("/:id/audio/upload-url", editors, handlers.CreateAudioUploadURL(database, store, cfg))
	songs.POST("/:id/audio", editors, handlers.ConfirmAudio(database, store, cfg))
	songs.DELETE("/:id/audio", editors, handlers.DeleteAudio(database, store))

	// Library-wide audio usage, for the "you're at the limit" manager.
	r.GET("/api/audio", auth, handlers.ListAudio(database, cfg))

	setlists := r.Group("/api/setlists")
	setlists.Use(auth)
	setlists.GET("", handlers.ListSetlists(database))
	setlists.GET("/:id", handlers.GetSetlist(database))
	setlists.POST("", editors, handlers.CreateSetlist(database))
	setlists.PATCH("/:id", editors, handlers.UpdateSetlist(database))
	setlists.DELETE("/:id", editors, handlers.DeleteSetlist(database))
	setlists.POST("/:id/items", editors, handlers.AddSetlistItem(database))
	setlists.PATCH("/:id/items/:itemId", editors, handlers.UpdateSetlistItem(database))
	setlists.DELETE("/:id/items/:itemId", editors, handlers.DeleteSetlistItem(database))
	setlists.POST("/:id/items/:itemId/resync", editors, handlers.ResyncSetlistItem(database))
	// Personal prefs (capo, private note) — deliberately NOT editors-only:
	// every member writes their own row and nobody else's.
	setlists.PUT("/:id/items/:itemId/prefs", handlers.UpsertItemPrefs(database))
	setlists.POST("/:id/reorder", editors, handlers.ReorderSetlist(database))

	users := r.Group("/api/users")
	users.Use(auth, adminOnly)
	users.GET("", handlers.ListUsers(database))
	users.POST("", handlers.CreateUser(database, cfg))
	users.POST("/:id/reinvite", handlers.ReinviteUser(database, cfg))
	users.PATCH("/:id", handlers.UpdateUser(database))
	users.DELETE("/:id", handlers.DeleteUser(database))

	return r
}
