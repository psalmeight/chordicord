# FCF Chords

A shared songbook for your team: lyrics and chords with live transposition.

Chords are stored once, in the key the song was written in. Transposition is
computed at render time from `(stored chords, song key, display key)` — nothing
transposed is ever written back. That means any member can view any song in any
key without affecting what anyone else sees, and the source of truth can never
drift out of sync with the chords.

## Stack

Same shape as `doctrine`:

- **api/** — Go 1.23 + Gin, `sqlx`/`pgx` over Postgres, hand-written SQL, no ORM
- **web/** — React 19 + Vite 6 + TypeScript + Chakra UI v3
- **Auth** — HS256 JWT bearer tokens in `localStorage`, admin-created accounts
  with an invite link (no self-signup, no email sending)

## Roles

| Role | Can do |
|---|---|
| `admin` | Everything, plus managing the team |
| `leader` | Create and edit songs and setlists |
| `member` | View, transpose, print |

## Getting started

```bash
# 1. Configure
cp api/.env.example api/.env      # set DATABASE_URL and JWT_SECRET
cp web/.env.example web/.env

# 2. Create the schema and the first admin
npm run db:setup
npm run db:seed                   # admin@transcode.local / Admin123!

# 3. Run both apps
npm install
npm run dev                       # api :8082, web :5173
```

Generate a secret with `openssl rand -base64 48`.

Log in as the seeded admin, change the password, then invite your team from
**Team** — you'll get a link to send each person, and they choose their own
password.

## Writing a chart

The song body is ChordPro-style text. Put a chord in square brackets
immediately before the syllable it lands on:

```
{Verse 1}
[G]Amazing grace how [C]sweet the [G]sound
That [G]saved a wretch like [D]me

{Chorus}
| G | C | G | D |
[G]I once was [C]lost but [G]now am found
```

- `{Verse 1}` marks a section (a bare `Chorus:` line works too)
- `| G | C |` on its own line is an instrumental / turnaround
- `#` starts a comment line

Everything else — title, artist, key, time signature, tempo, feel, CCLI number,
tags, and free-text notes — lives in structured fields alongside the body.

## Transposing

On any song: pick a key, or step up and down a semitone at a time. **Original**
snaps back. Key spelling follows convention — transposing to E♭ gives you B♭,
not A♯.

The **Capo** selector shows the shapes a capo'd guitarist actually fingers while
telling you the key it sounds in.

Setlists take this one step further: each song carries an optional per-service
key, so the same song can sit in different keys in different setlists without
ever touching the song itself.

## Tests

```bash
npm test
```

The transposition engine (`web/src/lib/chords.ts`) and the ChordPro parser
(`web/src/lib/chordpro.ts`) are covered, including enharmonic spelling and
round-trip stability.

## API

All routes require `Authorization: Bearer <token>` except `/api/health`,
`/api/auth/login`, and `/api/auth/accept-invite`.

```
POST   /api/auth/login
POST   /api/auth/accept-invite
GET    /api/auth/me
POST   /api/auth/change-password

GET    /api/songs                 ?q= &tag=
GET    /api/songs/tags
GET    /api/songs/:id
POST   /api/songs                 leader+
PATCH  /api/songs/:id             leader+   ?clearTempo=1
DELETE /api/songs/:id             leader+

GET    /api/setlists
GET    /api/setlists/:id          returns setlist + items with song content
POST   /api/setlists              leader+
PATCH  /api/setlists/:id          leader+
DELETE /api/setlists/:id          leader+
POST   /api/setlists/:id/items    leader+
PATCH  /api/setlists/:id/items/:itemId
DELETE /api/setlists/:id/items/:itemId
POST   /api/setlists/:id/reorder  leader+

GET    /api/users                 admin
POST   /api/users                 admin — returns an invite link
POST   /api/users/:id/reinvite    admin
PATCH  /api/users/:id             admin
DELETE /api/users/:id             admin
```

## Deploying

Two Vercel projects, as in `doctrine`:

- `api/` — `vercel.json` rewrites everything to the single Go function at
  `api/index.go`. Set `DATABASE_URL`, `JWT_SECRET`, `WEB_URL`.
- `web/` — `vercel.json` provides the SPA history fallback. Set `VITE_API_URL`.

## Notes on the auth design

Carried over from doctrine deliberately:

- `RequireAuth` re-reads the user on every request, so role changes and removals
  take effect immediately.
- A DB error during auth returns 500, not 401 — a database blip must not log
  the whole team out.
- Invite tokens carry `purpose: "invite"` and `RequireAuth` rejects any token
  with a `purpose` claim, so an invite link can't be used as a session.
- Admins cannot delete themselves or demote/remove the last admin.

Known trade-offs, same as doctrine: session tokens last 60 days and can't be
revoked, and tokens live in `localStorage` (XSS-exposed). Doctrine offsets this
with an IP allowlist, which this app does not have — worth adding if the
songbook ever holds anything sensitive.
