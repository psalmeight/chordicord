package middleware

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/auth0/go-jwt-middleware/v2/jwks"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"transcode/api/models"
)

const userColumns = `id, email, username, auth0_sub, name, role, verified_at, created_at, updated_at`

// RequireAuth validates the Auth0 access token and re-loads the user on every
// request, so role changes and deletions take effect immediately.
//
// Sign-up is open: the first request carrying a token for an unknown `sub`
// creates that person as a member (or links them to a pre-existing row with
// the same verified email, which is how accounts from before Auth0 keep their
// role). Roles never come from Auth0 — they live only in the users table.
func RequireAuth(database *sqlx.DB, auth0Domain, audience string) gin.HandlerFunc {
	issuer, err := url.Parse("https://" + auth0Domain + "/")
	if err != nil {
		log.Fatalf("Invalid AUTH0_DOMAIN: %v", err)
	}
	// Signing keys are fetched from the tenant's JWKS endpoint and cached;
	// Auth0 rotates them rarely, so a short-lived cache costs nothing.
	provider := jwks.NewCachingProvider(issuer, 15*time.Minute)
	v, err := validator.New(
		provider.KeyFunc,
		validator.RS256,
		issuer.String(),
		[]string{audience},
		validator.WithAllowedClockSkew(30*time.Second),
	)
	if err != nil {
		log.Fatalf("Failed to set up Auth0 token validator: %v", err)
	}
	a := &authn{db: database, validator: v, userinfoURL: issuer.String() + "userinfo"}

	return func(c *gin.Context) {
		raw := c.GetHeader("Authorization")
		token := strings.TrimSpace(strings.TrimPrefix(raw, "Bearer "))
		if token == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}

		claims, err := a.validator.ValidateToken(c.Request.Context(), token)
		if err != nil {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		sub := claims.(*validator.ValidatedClaims).RegisteredClaims.Subject
		if sub == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Unauthorized"})
			return
		}

		var user models.User
		err = database.Get(&user, `SELECT `+userColumns+` FROM users WHERE auth0_sub = $1`, sub)
		if errors.Is(err, sql.ErrNoRows) {
			u, status, perr := a.provision(c.Request.Context(), sub, token)
			if perr != nil {
				c.AbortWithStatusJSON(status, gin.H{"error": perr.Error()})
				return
			}
			user = *u
			err = nil
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

type authn struct {
	db          *sqlx.DB
	validator   *validator.Validator
	userinfoURL string
}

// profile is the subset of Auth0's /userinfo response we act on.
type profile struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Nickname      string `json:"nickname"`
}

// provision runs once per person, on the first request for a `sub` we have
// never seen. It asks Auth0 who the token belongs to rather than trusting
// anything the client sends, then either links an existing row by email or
// creates a new member. Returns the HTTP status to use when it refuses.
func (a *authn) provision(ctx context.Context, sub, token string) (*models.User, int, error) {
	p, err := a.userinfo(ctx, token)
	if err != nil {
		log.Printf("auth0 userinfo failed for %s: %v", sub, err)
		return nil, 502, errors.New("Could not confirm your identity with Auth0")
	}
	if p.Sub != sub {
		return nil, 401, errors.New("Unauthorized")
	}
	email := strings.ToLower(strings.TrimSpace(p.Email))
	if email == "" {
		return nil, 403, errors.New("Your sign-in method did not share an email address")
	}
	name := strings.TrimSpace(p.Name)
	if name == "" {
		name = strings.TrimSpace(p.Nickname)
	}
	if name == "" {
		name = email[:strings.Index(email, "@")]
	}

	// Link-by-email is what carries pre-Auth0 accounts (and their roles)
	// across. It must only ever happen on a *verified* email: Auth0 lets a
	// database user sign in before clicking the verification link, and
	// linking on an unverified address would let anyone claim an admin's row
	// by typing their address at sign-up.
	var existing models.User
	err = a.db.GetContext(ctx, &existing, `SELECT `+userColumns+` FROM users WHERE email = $1`, email)
	switch {
	case err == nil:
		if existing.Auth0Sub != nil && *existing.Auth0Sub != sub {
			return nil, 403, errors.New("This email is already linked to a different sign-in method")
		}
		if !p.EmailVerified {
			return nil, 403, errors.New("Verify your email address with Auth0, then sign in again")
		}
		var user models.User
		err = a.db.GetContext(ctx, &user,
			`UPDATE users SET auth0_sub = $1, verified_at = COALESCE(verified_at, NOW()), updated_at = NOW()
			 WHERE id = $2 RETURNING `+userColumns, sub, existing.ID)
		if err != nil {
			return nil, 500, errors.New("Internal error")
		}
		return &user, 0, nil
	case errors.Is(err, sql.ErrNoRows):
		// fall through to create
	default:
		return nil, 500, errors.New("Internal error")
	}

	var verifiedAt *time.Time
	if p.EmailVerified {
		now := time.Now()
		verifiedAt = &now
	}
	var user models.User
	err = a.db.GetContext(ctx, &user,
		`INSERT INTO users (email, name, role, verified_at, auth0_sub)
		 VALUES ($1, $2, 'member', $3, $4) RETURNING `+userColumns,
		email, name, verifiedAt, sub)
	if err != nil {
		// Two first requests racing (the app fires several on load): the
		// loser's INSERT collides on auth0_sub or email, and the winner's row
		// is the one to use.
		if rerr := a.db.GetContext(ctx, &user, `SELECT `+userColumns+` FROM users WHERE auth0_sub = $1`, sub); rerr == nil {
			return &user, 0, nil
		}
		log.Printf("creating user for %s failed: %v", sub, err)
		return nil, 500, errors.New("Internal error")
	}
	return &user, 0, nil
}

func (a *authn) userinfo(ctx context.Context, token string) (*profile, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.userinfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo returned %d", res.StatusCode)
	}
	var p profile
	if err := json.NewDecoder(res.Body).Decode(&p); err != nil {
		return nil, err
	}
	return &p, nil
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
