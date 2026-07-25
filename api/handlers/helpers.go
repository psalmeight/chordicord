package handlers

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"transcode/api/models"
)

func uuidString() string { return uuid.New().String() }

// userPayload is an explicit allowlist — never marshal models.User directly.
func userPayload(u *models.User) gin.H {
	return gin.H{
		"id":         u.ID,
		"email":      u.Email,
		"name":       u.Name,
		"role":       u.Role,
		"verifiedAt": u.VerifiedAt,
	}
}

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// firstOrigin picks the primary origin out of the comma-separated WEB_URL,
// for building links we hand to humans.
func firstOrigin(webURL string) string {
	parts := strings.Split(webURL, ",")
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}
