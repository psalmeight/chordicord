package handlers

import (
	"github.com/gin-gonic/gin"

	"transcode/api/middleware"
)

// Me returns the signed-in user. Sign-in itself happens at Auth0; the first
// call here with a fresh token is what creates or links the users row (see
// middleware.RequireAuth), so the web app calls it right after login.
func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		c.JSON(200, gin.H{"user": userPayload(user)})
	}
}
