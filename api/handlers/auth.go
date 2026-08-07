package handlers

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"

	"transcode/api/config"
	"transcode/api/middleware"
	"transcode/api/models"
)

const (
	sessionTTL = 60 * 24 * time.Hour
	inviteTTL  = 7 * 24 * time.Hour
	bcryptCost = 10
)

func makeToken(userID, secret string, expiry time.Duration) (string, error) {
	claims := jwt.MapClaims{
		"userId": userID,
		"exp":    time.Now().Add(expiry).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// makeInviteToken carries purpose=invite so RequireAuth will refuse it.
func makeInviteToken(userID, secret string, expiry time.Duration) (string, error) {
	claims := jwt.MapClaims{
		"userId":  userID,
		"purpose": "invite",
		"exp":     time.Now().Add(expiry).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func Login(database *sqlx.DB, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// One sign-in field, three spellings on the wire. `identifier` is what
		// the app sends now; `email` and `username` are accepted so older
		// clients (and anything scripted against the original API) keep working.
		var body struct {
			Identifier string `json:"identifier"`
			Email      string `json:"email"`
			Username   string `json:"username"`
			Password   string `json:"password"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Email or username and password required"})
			return
		}
		identifier := body.Identifier
		if identifier == "" {
			identifier = body.Email
		}
		if identifier == "" {
			identifier = body.Username
		}
		if identifier == "" || body.Password == "" {
			c.JSON(400, gin.H{"error": "Email or username and password required"})
			return
		}

		// Both columns are stored lowercased, so one normalised value matches
		// either. Accounts with no username are unaffected — NULL = $1 is never
		// true. Nothing here validates that an address contains '@', so two
		// rows *can* match: one person's username colliding with another's
		// unusual email. Email wins that tie explicitly rather than by whatever
		// order the planner happens to return, which would otherwise lock one
		// of the two out at random.
		var user models.User
		err := database.Get(&user,
			`SELECT id, email, username, password_hash, name, role, verified_at, created_at, updated_at
			 FROM users WHERE email = $1 OR username = $1
			 ORDER BY (email = $1) DESC LIMIT 1`, normalizeEmail(identifier))
		if err != nil {
			c.JSON(401, gin.H{"error": "Invalid credentials"})
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)); err != nil {
			c.JSON(401, gin.H{"error": "Invalid credentials"})
			return
		}

		token, err := makeToken(user.ID, secret, sessionTTL)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		c.JSON(200, gin.H{"token": token, "user": userPayload(&user)})
	}
}

func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		c.JSON(200, gin.H{"user": userPayload(user)})
	}
}

// AcceptInvite consumes an invite token, sets the user's first password and
// marks them verified, returning a real session token.
func AcceptInvite(database *sqlx.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Token    string `json:"token"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
			c.JSON(400, gin.H{"error": "Token and password required"})
			return
		}
		if len(body.Password) < 8 {
			c.JSON(400, gin.H{"error": "Password must be at least 8 characters"})
			return
		}

		parsed, err := jwt.Parse(body.Token, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		}, jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !parsed.Valid {
			c.JSON(400, gin.H{"error": "Invite link is invalid or has expired"})
			return
		}
		claims, ok := parsed.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(400, gin.H{"error": "Invite link is invalid or has expired"})
			return
		}
		if purpose, _ := claims["purpose"].(string); purpose != "invite" {
			c.JSON(400, gin.H{"error": "Invite link is invalid or has expired"})
			return
		}
		userID, _ := claims["userId"].(string)
		if userID == "" {
			c.JSON(400, gin.H{"error": "Invite link is invalid or has expired"})
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcryptCost)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}

		var user models.User
		err = database.Get(&user,
			`UPDATE users SET password_hash = $1, verified_at = NOW(), updated_at = NOW()
			 WHERE id = $2
			 RETURNING id, email, username, password_hash, name, role, verified_at, created_at, updated_at`,
			string(hash), userID)
		if err != nil {
			c.JSON(400, gin.H{"error": "Invite link is invalid or has expired"})
			return
		}

		token, err := makeToken(user.ID, cfg.JWTSecret, sessionTTL)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		c.JSON(200, gin.H{"token": token, "user": userPayload(&user)})
	}
}

// ChangePassword skips the current-password check exactly once, for a user
// who has never set one (verified_at IS NULL).
func ChangePassword(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.GetUser(c)
		var body struct {
			CurrentPassword string `json:"currentPassword"`
			NewPassword     string `json:"newPassword"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}
		if len(body.NewPassword) < 8 {
			c.JSON(400, gin.H{"error": "Password must be at least 8 characters"})
			return
		}

		if user.VerifiedAt != nil {
			if body.CurrentPassword == "" {
				c.JSON(400, gin.H{"error": "Current password is required"})
				return
			}
			if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)); err != nil {
				c.JSON(400, gin.H{"error": "Current password is incorrect"})
				return
			}
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcryptCost)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		if _, err := database.Exec(
			`UPDATE users SET password_hash = $1, verified_at = NOW(), updated_at = NOW() WHERE id = $2`,
			string(hash), user.ID); err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

// InviteLink builds the URL an admin copies to a new member.
func inviteLink(webURL, token string) string {
	return strings.TrimRight(firstOrigin(webURL), "/") + "/invite/" + token
}
