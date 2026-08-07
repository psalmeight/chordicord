package handlers

import (
	"errors"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"transcode/api/models"
)

func uuidString() string { return uuid.New().String() }

// userPayload is an explicit allowlist — never marshal models.User directly.
func userPayload(u *models.User) gin.H {
	return gin.H{
		"id":         u.ID,
		"email":      u.Email,
		"username":   u.Username,
		"name":       u.Name,
		"role":       u.Role,
		"verifiedAt": u.VerifiedAt,
	}
}

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// normalizeUsername mirrors normalizeEmail so login can lowercase one field and
// match it against either column. Lowercasing on the way in is also what makes
// the plain UNIQUE index on username case-insensitive — without it "Dave" and
// "dave" would be two accounts.
func normalizeUsername(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// The character set is deliberately the set that survives normalizeUsername
// unchanged, so the stored handle is always exactly what the owner will type.
var usernamePattern = regexp.MustCompile(`^[a-z0-9_-]{3,32}$`)

// validateUsername returns the storable form of a non-empty username. Callers
// decide what an empty string means — for a nullable column it's "no username",
// which is legal, so it never reaches here.
func validateUsername(s string) (string, error) {
	u := normalizeUsername(s)
	// Login takes one identifier for both columns, so a username that looked
	// like an address would make "which did they mean" unanswerable. The
	// pattern already rejects '@'; this only says so in words worth reading.
	if strings.Contains(u, "@") {
		return "", errors.New("Username cannot contain @ — use letters, numbers, underscores or hyphens")
	}
	if !usernamePattern.MatchString(u) {
		return "", errors.New("Username must be 3-32 characters, using only letters, numbers, underscores or hyphens")
	}
	return u, nil
}

// isUniqueViolation reports whether err is Postgres 23505, and on which
// constraint. The driver is pgx, so the error is a *pgconn.PgError even though
// lib/pq is linked in for its array types.
func isUniqueViolation(err error) (string, bool) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return pgErr.ConstraintName, true
	}
	return "", false
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
