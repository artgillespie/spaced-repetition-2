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

- **`public/index.html`** - Main HTML shell, loads CDN libraries (marked, MathJax)
- **`public/js/app.js`** - SPA router, state management, all UI rendering
- **`public/css/style.css`** - Styling with CSS variables for dark/light themes

#### Key Frontend Functions

| Function | Purpose |
|----------|---------|
| `navigate(path)` | Client-side navigation |
| `renderMarkdown(text)` | Convert Markdown to HTML via `marked` library |
| `typesetMath(elements)` | Trigger MathJax typesetting on elements |
| `showModal(title, content, footer, options)` | Display modal dialog (`options.wide` for wider modals) |
| `setupCardEditorPreview()` | Initialize live preview listeners for card editor |

#### Frontend State

- `state.user` - Current authenticated user
- `state.token` - Auth token (persisted to localStorage)
- `state.theme` - Theme preference ('light', 'dark', 'system')
- `state.providers` - Available auth providers
- `window.reviewState` - Review session state (cards, currentIndex, showingAnswer)
- `window.deckViewState` - Deck view state (deck, cards, page, perPage, expandedCard)

### Database Schema

```sql
users (id, email, password_hash, name, avatar_url, created_at)
oauth_accounts (id, user_id, provider, provider_id, created_at)
sessions (id, user_id, token, expires_at, created_at)
decks (id, user_id, name, description, created_at)
cards (id, deck_id, front, back, ease_factor, interval, repetitions, due_date, created_at, updated_at)
review_history (id, card_id, quality, ease_factor, interval, reviewed_at)
```

### CDN Dependencies

Loaded in `public/index.html`:
- **marked** - Markdown parser (`https://cdn.jsdelivr.net/npm/marked/marked.min.js`)
- **MathJax 3** - LaTeX math rendering (`https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js`)

## Features

### Card Content Formatting

Cards support **Markdown** and **LaTeX math**:

```markdown
# Markdown Examples
**bold**, *italic*, `code`, [links](url)
- bullet lists
1. numbered lists

# Math Examples (LaTeX)
Inline: $E = mc^2$ or \(E = mc^2\)
Block:
$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
```

### Card Editor

- Side-by-side Markdown editor with live preview
- Real-time MathJax rendering in preview pane
- Separate panels for front (question) and back (answer)

### Deck View

- Paginated card list (15 cards per page)
- Compact rows with click-to-expand for answer preview
- Edit/delete actions on hover

### Review Mode

- Shows front of card, click to reveal answer
- Three response buttons: Again (failed), Hard, Good
- Displays projected next review interval for each choice

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
- `GET /api/decks` - List user's decks (includes `card_count`, `due_count`)
- `POST /api/decks` - Create deck `{name, description?}`
- `GET /api/decks/:id` - Get deck
- `PUT /api/decks/:id` - Update deck
- `DELETE /api/decks/:id` - Delete deck and all its cards

### Cards (requires auth)
- `GET /api/cards/deck/:deckId` - List cards in deck
- `POST /api/cards/deck/:deckId` - Create card `{front, back}`
- `POST /api/cards/deck/:deckId/import` - Import cards from Hashcards format
- `GET /api/cards/:id` - Get card
- `PUT /api/cards/:id` - Update card
- `DELETE /api/cards/:id` - Delete card

### Review (requires auth)
- `GET /api/review/due` - Get due cards (optional `?deckId=`)
- `GET /api/review/stats` - Get review statistics
- `POST /api/review/submit` - Submit review `{cardId, quality: 0-5}`
- `GET /api/review/history/:cardId` - Get review history

### Webhook
- `POST /api/webhook/github` - GitHub push webhook (auto-deploy)
- `GET /api/webhook/health` - Health check

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

6. **Markdown + Math rendering** - Card content uses `marked` for Markdown and MathJax 3 for LaTeX. MathJax config:
   - Inline delimiters: `$...$` and `\(...\)`
   - Block delimiters: `$$...$$` and `\[...\]`
   - `typesetMath()` must be called after dynamic content updates

7. **Modal system** - `showModal()` creates overlay with optional `{wide: true}` for card editor.

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

### Add new frontend route
1. Add `route('/path', async (params) => { ... })` in `app.js`
2. Use `navigate('/path')` for client-side navigation
3. Ensure auth check with `if (!await checkAuth()) { navigate('/login', true); return; }`

### Update card editor
1. Modify `showCreateCardModal()` and `showEditCardModal()` in `app.js`
2. Update `setupCardEditorPreview()` if adding new preview functionality
3. Call `typesetMath()` after rendering any math content

### Add CDN library
1. Add `<script>` tag in `public/index.html` before `app.js`
2. Check for library availability: `if (typeof LibraryName !== 'undefined')`
3. Document in CDN Dependencies section above

## GitHub Webhook (Auto-Deploy)

The app includes a webhook endpoint for automatic deployment when changes are pushed to GitHub.

### Webhook Endpoints
- `POST /api/webhook/github` - Receives GitHub push events, pulls changes, restarts service
- `GET /api/webhook/health` - Health check endpoint

### Setup in GitHub
1. Go to your GitHub repo → Settings → Webhooks → Add webhook
2. Configure:
   - **Payload URL**: `https://spaced-repetition-blozs.sprites.app/api/webhook/github`
   - **Content type**: `application/json`
   - **Events**: Just the `push` event
3. Save the webhook

### How It Works
1. Push to `main` branch triggers webhook
2. Webhook handler runs `git pull` in the repo directory
3. Service restarts automatically to load new code
4. Non-main branches and non-push events are ignored

### Testing Locally
```bash
# Health check
curl http://localhost:3000/api/webhook/health

# Simulate GitHub push (for testing)
curl -X POST http://localhost:3000/api/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{"ref":"refs/heads/main","head_commit":{"message":"test"}}'
```
