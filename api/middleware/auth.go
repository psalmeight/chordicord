package middleware

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"

	"transcode/api/models"
)

// RequireAuth validates the bearer token and re-loads the user on every
// request, so role changes and deletions take effect immediately.
func RequireAuth(database *sqlx.DB, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.GetHeader("Authorization")
		token := strings.TrimSpace(strings.TrimPrefix(raw, "Bearer "))
		if token == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}

		parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !parsed.Valid {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}

		claims, ok := parsed.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		// Invite tokens are minted from the same secret; they must not be
		// usable as session tokens.
		if purpose, _ := claims["purpose"].(string); purpose != "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		userID, _ := claims["userId"].(string)
		if userID == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}

		var user models.User
		err = database.Get(&user,
			`SELECT id, email, username, password_hash, name, role, verified_at, created_at, updated_at
			 FROM users WHERE id = $1`, userID)
		if errors.Is(err, sql.ErrNoRows) {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		if err != nil {
			// A DB blip is not an auth failure — don't log everyone out.
			c.AbortWithStatusJSON(500, gin.H{"error": "Internal error"})
			return
		}

		c.Set("user", &user)
		c.Next()
	}
}

func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetUser(c)
		if user == nil {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		for _, r := range roles {
			if user.Role == r {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(403, gin.H{"error": "Forbidden"})
	}
}

func GetUser(c *gin.Context) *models.User {
	v, ok := c.Get("user")
	if !ok {
		return nil
	}
	user, _ := v.(*models.User)
	return user
}
