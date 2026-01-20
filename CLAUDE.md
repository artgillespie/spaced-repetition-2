# Spaced Repetition App

A flashcard application with spaced repetition using the SM-2 algorithm, built with Bun and Hono.

## Quick Start

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start

# Run tests
bun test

# Watch tests
bun run test:watch
```

## Architecture

### Backend (Bun + Hono)

- **`src/server.ts`** - Main server entry point, static file serving, SPA routing
- **`src/config.ts`** - Environment configuration (PORT, BASE_URL, OAuth credentials)
- **`src/db/index.ts`** - SQLite database connection (uses absolute path)
- **`src/db/schema.ts`** - Database schema initialization
- **`src/auth.ts`** - Authentication utilities (password hashing, sessions, users)
- **`src/middleware/auth.ts`** - Auth middleware (`requireAuth`)
- **`src/routes/auth.ts`** - Auth endpoints (signup, signin, logout, OAuth)
- **`src/routes/decks.ts`** - Deck CRUD endpoints
- **`src/routes/cards.ts`** - Card CRUD endpoints
- **`src/routes/review.ts`** - Review endpoints with SM-2 algorithm

### Frontend (Vanilla JS SPA)

- **`public/index.html`** - Main HTML shell
- **`public/js/app.js`** - SPA router, state management, all UI rendering
- **`public/css/style.css`** - Styling with CSS variables for dark/light themes

### Database Schema

```
users (id, email, password_hash, name, created_at)
oauth_accounts (id, user_id, provider, provider_id, created_at)
sessions (id, user_id, token, expires_at, created_at)
decks (id, user_id, name, description, created_at)
cards (id, deck_id, front, back, ease_factor, interval, repetitions, due_date, created_at, updated_at)
review_history (id, card_id, quality, ease_factor, interval, reviewed_at)
```

## API Endpoints

### Auth
- `GET /api/auth/providers` - Available auth providers
- `GET /api/auth/me` - Current user info
- `POST /api/auth/signup` - Email/password signup
- `POST /api/auth/signin` - Email/password signin
- `POST /api/auth/logout` - Logout
- `GET /api/auth/github` - GitHub OAuth redirect
- `GET /api/auth/github/callback` - GitHub OAuth callback
- `GET /api/auth/google` - Google OAuth redirect
- `GET /api/auth/google/callback` - Google OAuth callback

### Decks (requires auth)
- `GET /api/decks` - List user's decks
- `POST /api/decks` - Create deck
- `GET /api/decks/:id` - Get deck
- `PUT /api/decks/:id` - Update deck
- `DELETE /api/decks/:id` - Delete deck

### Cards (requires auth)
- `GET /api/cards/deck/:deckId` - List cards in deck
- `POST /api/cards/deck/:deckId` - Create card
- `GET /api/cards/:id` - Get card
- `PUT /api/cards/:id` - Update card
- `DELETE /api/cards/:id` - Delete card

### Review (requires auth)
- `GET /api/review/due` - Get due cards (optional `?deckId=`)
- `GET /api/review/stats` - Get review statistics
- `POST /api/review/submit` - Submit review `{cardId, quality: 0-5}`
- `GET /api/review/history/:cardId` - Get review history

## SM-2 Algorithm

Quality ratings:
- 0-2: Failed recall (card resets, interval = 1 day)
- 3: Correct with difficulty
- 4: Correct with some hesitation
- 5: Perfect recall

Interval progression:
- 1st review: 1 day
- 2nd review: 6 days
- Subsequent: interval × ease_factor

Ease factor:
- Starts at 2.5
- Adjusted based on quality: `EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))`
- Minimum: 1.3

## Configuration

Environment variables (set in `.env` or pass to service):

```
PORT=3000
BASE_URL=https://spaced-repetition-blozs.sprites.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

## Deployment (Sprite)

The app runs as a Sprite service:

```bash
# View service status
sprite-env services list

# Restart service
sprite-env services stop spaced-repetition
sprite-env services start spaced-repetition

# View logs
tail -f /.sprite/logs/services/spaced-repetition.log

# Create checkpoint
sprite-env checkpoints create --comment "Description"
```

Service configuration:
- Command: `bun run --env-file /home/sprite/spaced-repetition/.env /home/sprite/spaced-repetition/src/server.ts`
- HTTP Port: 3000
- Hostname: 0.0.0.0 (for external access)

## Testing

Test files in `tests/`:
- `setup.ts` - Test utilities and helpers
- `app.ts` - Test app factory with dependency injection
- `auth.test.ts` - Authentication tests
- `decks.test.ts` - Deck CRUD tests
- `cards.test.ts` - Card CRUD tests
- `review.test.ts` - Review and SM-2 algorithm tests

Tests use in-memory SQLite databases for isolation.

## Key Implementation Notes

1. **Static file serving uses absolute paths** (`/home/sprite/spaced-repetition/public`) because the service may run from different working directories.

2. **Database uses absolute path** (`/home/sprite/spaced-repetition/spaced-repetition.sqlite`) for the same reason.

3. **SPA routing** - All non-API, non-static routes serve `index.html`. Static files are explicitly routed for `/css/*` and `/js/*`.

4. **Auth tokens** - 64-character hex strings stored in sessions table with 30-day expiration.

5. **OAuth flow** - Redirects to provider, callback creates/links user, redirects to `/?token=...` for frontend to capture.

6. **Markdown support** - Card content supports Markdown via the `marked` library (loaded from CDN).

## Common Tasks

### Add a new API endpoint
1. Add route in appropriate `src/routes/*.ts` file
2. Add tests in corresponding `tests/*.test.ts`
3. Update frontend in `public/js/app.js` if needed

### Modify database schema
1. Update `src/db/schema.ts`
2. For existing databases, add migration SQL or recreate

### Add OAuth provider
1. Add credentials to `src/config.ts`
2. Add routes in `src/routes/auth.ts` (follow GitHub/Google pattern)
3. Update `GET /api/auth/providers` response
4. Add button in frontend login/signup forms
