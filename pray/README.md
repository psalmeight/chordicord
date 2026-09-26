# FCF Prayer

A prayer list. Admins add, edit and delete prayers and the categories they
sit in; a prayer can also be left uncategorized. Everyone else who signs in
can read the list.

Same stack and same sign-in as the songbook (`web/`): React + Vite + Chakra UI
here, the same Go API behind it, the same Auth0 tenant, and the same roles
(set on the songbook's **Team** page). The data is separate: everything lives
in its own Postgres schema, `prayer`, created by `api/prayer` on API startup.

## Running locally

```bash
cp pray/.env.example pray/.env    # same Auth0 values as web/.env
cd pray && npm install && cd ..
npm run dev:api                   # :8082
npm run dev:pray                  # :5174
```

Two bits of one-time config so the API and Auth0 accept this app's origin:

- `WEB_URL` in `api/.env` is a comma-separated list; add `http://localhost:5174`
  (and the deployed origin).
- In Auth0, add the same origins to the SPA application's Allowed Callback,
  Logout and Web Origin URLs.

## API

All routes need the Auth0 bearer token.

```
GET    /api/prayer/categories
POST   /api/prayer/categories      admin
PATCH  /api/prayer/categories/:id  admin
DELETE /api/prayer/categories/:id  admin   prayers become uncategorized

GET    /api/prayer/prayers         ?category=<id> | none
POST   /api/prayer/prayers         admin   {title, details, categoryId|null}
PATCH  /api/prayer/prayers/:id     admin   clearCategory: true to uncategorize
DELETE /api/prayer/prayers/:id     admin
```

## Deploying

A third Vercel project with root directory `pray` (the `vercel.json` gives it
the SPA fallback). Set `VITE_API_URL` and the three `VITE_AUTH0_*` values.
