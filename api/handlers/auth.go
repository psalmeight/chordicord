package handlers

import (
	"github.com/gin-gonic/gin"

	"transcode/api/middleware"
)

// Me returns the signed-in user. Sign-in itself happens at Auth0; the first
// call here with a fresh token is what creates or links the users row (see
// middleware.Auth), so the web app calls it right after login. It is the one
// route a pending account can reach, so the apps learn why they're waiting.
func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		c.JSON(200, gin.H{"user": userPayload(user)})
	}
}
