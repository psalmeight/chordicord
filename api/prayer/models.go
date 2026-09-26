package prayer

import "time"

type Category struct {
	ID        string    `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

type Prayer struct {
	ID string `db:"id" json:"id"`
	// nil when the prayer is uncategorized.
	CategoryID *string   `db:"category_id" json:"categoryId"`
	Title      string    `db:"title" json:"title"`
	Details    string    `db:"details" json:"details"`
	CreatedAt  time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt  time.Time `db:"updated_at" json:"updatedAt"`
}
