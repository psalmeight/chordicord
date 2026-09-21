package handlers

import (
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"transcode/api/middleware"
	"transcode/api/models"
)

var validRoles = map[string]bool{"admin": true, "leader": true, "member": true}

// ListUsers is the whole team. There is no "create": people appear here by
// signing in through Auth0, after which an admin can change their role.
func ListUsers(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var users []models.User
		err := database.Select(&users,
			`SELECT id, email, username, auth0_sub, name, role, verified_at, created_at, updated_at
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

func UpdateUser(database *sqlx.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var body struct {
			Name *string `json:"name"`
			Role *string `json:"role"`
			// username is nullable, so COALESCE can't say "take it away".
			// ClearUsername is the explicit flag, as on setlist items.
			Username      *string `json:"username"`
			ClearUsername bool    `json:"clearUsername"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}

		if body.Username != nil && !body.ClearUsername {
			u, err := validateUsername(*body.Username)
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			body.Username = &u
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
				username = CASE WHEN $3 THEN NULL ELSE COALESCE($4, username) END,
				updated_at = NOW()
			 WHERE id = $5
			 RETURNING id, email, username, auth0_sub, name, role, verified_at, created_at, updated_at`,
			body.Name, body.Role, body.ClearUsername, body.Username, id)
		if err != nil {
			if name, ok := isUniqueViolation(err); ok && name == "users_username_key" {
				c.JSON(400, gin.H{"error": "That username is already taken"})
				return
			}
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
