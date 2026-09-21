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
- **Auth** — Auth0. The web app signs in through Auth0's hosted page and
  sends RS256 access tokens; the API validates them against the tenant's
  JWKS. Sign-up is open: the first request from a new identity creates a
  `member` row (or links a pre-existing row with the same verified email).
  Roles live only in the app's `users` table. The optional `username` is a
  display handle left over from the old login form.

## Roles

| Role | Can do |
|---|---|
| `admin` | Everything, plus managing the team |
| `leader` | Create and edit songs and setlists |
| `member` | View, transpose, print |

## Getting started

```bash
# 1. Configure
cp api/.env.example api/.env      # set DATABASE_URL, AUTH0_DOMAIN, AUTH0_AUDIENCE
cp web/.env.example web/.env      # set VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, VITE_AUTH0_AUDIENCE

# 2. Create the schema and the first admin
npm run db:setup
SEED_ADMIN_EMAIL=you@example.com npm run db:seed

# 3. Run both apps
npm install
npm run dev                       # api :8082, web :5173
```

In Auth0 you need a **Single Page Application** (callback and logout URLs:
`http://localhost:5173` and the deployed web origin; Refresh Token Rotation
on) and an **API** whose identifier is the audience. The Auth0 MCP server's
onboarding tool sets both up and writes the `.env` values.

Sign in with the seeded email (verified in Auth0) and the row is claimed as
admin. Everyone else just signs in — they land as members, and you change
roles from **Team**.

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
- `## Big text` renders an oversized heading line (`###` and `####` step down)
- `*hold*` anywhere marks a red cue that is never treated as a chord
- `^^watch me^^` is the same, but blinks — for a cue you have to catch
  mid-song. It prints as a plain red cue, and holds still for anyone whose
  system asks for reduced motion.
- `^^C^^` round a chord blinks it without demoting it: unlike `*C*`, it stays a
  chord and transposes with everything else. Carets are emphasis, asterisks are
  prose, and what decides is simply whether the marked text parses as a chord.

The ⓘ button in the bottom-right corner opens the same reference with each rule
rendered as it will actually appear, on any page.

Everything else — title, artist, key, time signature, tempo, feel, CCLI number,
tags, and free-text notes — lives in structured fields alongside the body.

## Transposing

On any song: pick a key, or step up and down a semitone at a time. **Original**
snaps back. Key spelling follows convention — transposing to E♭ gives you B♭,
not A♯.

The **Capo** selector shows the shapes a capo'd guitarist actually fingers while
telling you the key it sounds in.

Setlists take this further: adding a song to a setlist takes a **copy** of it.
The copy — chart, key, notes, note cards, tempo — is editable per setlist
(leaders and admins, via the item's Edit button), everyone viewing the setlist
sees those edits, and the songbank version is never touched. An **Update from
songbank** action re-pulls the current songbank version into the copy when you
want it. On top of that, capo and a private note on each setlist song are
**per account**: saved to your login, synced across your devices, and invisible
to the rest of the team. The reference track's saved pitch also lives on the
setlist item, not the songbank — and it saves itself: pitch the track up a
semitone and the chart key follows it, both stored without pressing anything.
Unlink them with the chain button beside the pitch controls if you want the
track moved but the chords left where they are.

## Tests

```bash
npm test
```

The transposition engine (`web/src/lib/chords.ts`) and the ChordPro parser
(`web/src/lib/chordpro.ts`) are covered, including enharmonic spelling and
round-trip stability.

## API

All routes require `Authorization: Bearer <Auth0 access token>` except
`/api/health`.

```
GET    /api/auth/me               creates or links the account on first call

GET    /api/songs                 ?q= &tag=
GET    /api/songs/tags
GET    /api/songs/:id
POST   /api/songs                 leader+
PATCH  /api/songs/:id             leader+   ?clearTempo=1
DELETE /api/songs/:id             leader+

GET    /api/setlists
GET    /api/setlists/:id          returns setlist + items (each item is its own
                                  copy of the song) + your per-item prefs
POST   /api/setlists              leader+
PATCH  /api/setlists/:id          leader+
DELETE /api/setlists/:id          leader+
POST   /api/setlists/:id/items    leader+   snapshots the song into the item
PATCH  /api/setlists/:id/items/:itemId          leader+
DELETE /api/setlists/:id/items/:itemId          leader+
POST   /api/setlists/:id/items/:itemId/resync   leader+  re-pull from songbank
PUT    /api/setlists/:id/items/:itemId/prefs    any role — own capo/private note
POST   /api/setlists/:id/reorder  leader+

GET    /api/users                 admin
PATCH  /api/users/:id             admin
DELETE /api/users/:id             admin
```

## Deploying

Two Vercel projects, as in `doctrine`:

- `api/` — Framework preset **Go**, root directory `api`. Vercel builds
  `main.go` as a standalone server (it listens on `PORT`) and gin does all
  routing, so there is deliberately no `vercel.json`: with this preset a
  rewrite changes the path gin sees and every route 404s. `api/index.go` is
  only used if the preset is switched to "Other" (per-file functions).
  Set `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `WEB_URL` (include
  the deployed web origin).
- `web/` — `vercel.json` provides the SPA history fallback. Set `VITE_API_URL`
  and the three `VITE_AUTH0_*` values, and add the deployed origin to the
  Auth0 application's callback, logout and web origin lists.

## Notes on the auth design

Carried over from doctrine deliberately:

- `RequireAuth` re-reads the user on every request, so role changes and removals
  take effect immediately.
- A DB error during auth returns 500, not 401 — a database blip must not log
  the whole team out.
- Admins cannot delete themselves or demote/remove the last admin.
- Account creation trusts Auth0's `/userinfo`, never the client, for who a
  token belongs to. Linking to an existing row by email only happens when
  Auth0 reports the email as verified — otherwise anyone could claim an
  admin's row by typing that address at sign-up. An unverified newcomer still
  gets a fresh member row; `verified_at` stays NULL until Auth0 says so.
- A row whose email is already linked to a different Auth0 identity (say,
  Google and a password account with the same address) is refused rather
  than re-pointed, so nobody gets silently logged out of their account.

Tokens are short-lived and refresh-token rotated by the SDK; they are cached
in `localStorage` (XSS-exposed, same trade-off as before) because the silent
iframe alternative doesn't survive Safari or third-party-cookie blocking.
