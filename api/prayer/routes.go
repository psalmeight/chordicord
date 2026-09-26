package prayer

import (
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

// Register mounts the prayer routes under /api/prayer. auth and adminOnly are
// the same middleware the songbook uses, so a person's role is the one set on
// the Team page. Everyone signed in reads; only admins manage the list.
func Register(r *gin.Engine, database *sqlx.DB, auth, adminOnly gin.HandlerFunc) {
	g := r.Group("/api/prayer")
	g.Use(auth)

	g.GET("/categories", ListCategories(database))
	g.POST("/categories", adminOnly, CreateCategory(database))
	g.PATCH("/categories/:id", adminOnly, UpdateCategory(database))
	g.DELETE("/categories/:id", adminOnly, DeleteCategory(database))

	g.GET("/prayers", ListPrayers(database))
	g.POST("/prayers", adminOnly, CreatePrayer(database))
	g.PATCH("/prayers/:id", adminOnly, UpdatePrayer(database))
	g.DELETE("/prayers/:id", adminOnly, DeletePrayer(database))
}
