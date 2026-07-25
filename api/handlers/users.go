package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"

	"transcode/api/config"
	"transcode/api/middleware"
	"transcode/api/models"
)

var validRoles = map[string]bool{"admin": true, "leader": true, "member": true}

func ListUsers(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var users []models.User
		err := database.Select(&users,
			`SELECT id, email, password_hash, name, role, verified_at, created_at, updated_at
			 FROM users ORDER BY name`)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to load users"})
			return
		}
		out := make([]gin.H, 0, len(users))
		for i := range users {
			out = append(out, userPayload(&users[i]))
		}
		c.JSON(200, out)
	}
}

// CreateUser makes the account with a throwaway password and returns an
// invite link — the invitee chooses their own password. No email is sent;
// the admin copies the link.
func CreateUser(database *sqlx.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Email string `json:"email"`
			Name  string `json:"name"`
			Role  string `json:"role"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Email == "" || body.Name == "" {
			c.JSON(400, gin.H{"error": "Email and name are required"})
			return
		}
		if body.Role == "" {
			body.Role = "member"
		}
		if !validRoles[body.Role] {
			c.JSON(400, gin.H{"error": "Invalid role"})
			return
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(uuidString()), bcryptCost)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}

		var id string
		err = database.QueryRowx(
			`INSERT INTO users (email, password_hash, name, role)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			normalizeEmail(body.Email), string(hash), body.Name, body.Role).Scan(&id)
		if err != nil {
			c.JSON(400, gin.H{"error": "A user with that email already exists"})
			return
		}

		token, err := makeInviteToken(id, cfg.JWTSecret, inviteTTL)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		c.JSON(201, gin.H{
			"id":          id,
			"inviteToken": token,
			"inviteLink":  inviteLink(cfg.WebURL, token),
		})
	}
}

// ReinviteUser mints a fresh invite link for someone who never set a password
// or lost the original.
func ReinviteUser(database *sqlx.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var exists bool
		if err := database.Get(&exists, `SELECT true FROM users WHERE id = $1`, id); err != nil {
			c.JSON(404, gin.H{"error": "User not found"})
			return
		}
		token, err := makeInviteToken(id, cfg.JWTSecret, inviteTTL)
		if err != nil {
			c.JSON(500, gin.H{"error": "Internal error"})
			return
		}
		c.JSON(200, gin.H{"inviteToken": token, "inviteLink": inviteLink(cfg.WebURL, token)})
	}
}

func UpdateUser(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var body struct {
			Name *string `json:"name"`
			Role *string `json:"role"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}

		if body.Role != nil {
			if !validRoles[*body.Role] {
				c.JSON(400, gin.H{"error": "Invalid role"})
				return
			}
			// Never leave the team without an admin.
			if *body.Role != "admin" && isLastAdmin(database, id) {
				c.JSON(400, gin.H{"error": "Cannot demote the last admin"})
				return
			}
		}

		var user models.User
		err := database.Get(&user,
			`UPDATE users SET
				name = COALESCE($1, name),
				role = COALESCE($2, role)::user_role,
				updated_at = NOW()
			 WHERE id = $3
			 RETURNING id, email, password_hash, name, role, verified_at, created_at, updated_at`,
			body.Name, body.Role, id)
		if err != nil {
			c.JSON(404, gin.H{"error": "User not found"})
			return
		}
		c.JSON(200, userPayload(&user))
	}
}

func DeleteUser(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		me := middleware.GetUser(c)
		if me.ID == id {
			c.JSON(400, gin.H{"error": "You cannot delete your own account"})
			return
		}
		if isLastAdmin(database, id) {
			c.JSON(400, gin.H{"error": "Cannot delete the last admin"})
			return
		}
		if _, err := database.Exec(`DELETE FROM users WHERE id = $1`, id); err != nil {
			c.JSON(500, gin.H{"error": "Failed to delete user"})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func isLastAdmin(database *sqlx.DB, id string) bool {
	var role string
	if err := database.Get(&role, `SELECT role FROM users WHERE id = $1`, id); err != nil {
		return false
	}
	if role != "admin" {
		return false
	}
	var count int
	if err := database.Get(&count, `SELECT COUNT(*) FROM users WHERE role = 'admin'`); err != nil {
		return true // fail closed
	}
	return count <= 1
}
