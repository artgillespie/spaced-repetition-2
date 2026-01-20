// State management
const state = {
  user: null,
  token: localStorage.getItem('token'),
  theme: localStorage.getItem('theme') || 'system',
  providers: { email: true, github: false, google: false },
};

// API helper
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Theme management
function applyTheme() {
  const theme = state.theme;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  state.theme = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', state.theme);
  applyTheme();
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'system') applyTheme();
});

// Router
const routes = {};
let currentRoute = null;

function route(path, handler) {
  routes[path] = handler;
}

function navigate(path, replace = false) {
  if (replace) {
    history.replaceState(null, '', path);
  } else {
    history.pushState(null, '', path);
  }
  handleRoute();
}

function handleRoute() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // Handle OAuth callback token
  const token = params.get('token');
  if (token) {
    state.token = token;
    localStorage.setItem('token', token);
    navigate('/', true);
    return;
  }

  // Handle OAuth errors
  const error = params.get('error');
  if (error) {
    console.error('Auth error:', error);
    navigate('/', true);
    return;
  }

  // Find matching route
  for (const [pattern, handler] of Object.entries(routes)) {
    const match = matchRoute(pattern, path);
    if (match) {
      currentRoute = { pattern, handler, params: match };
      render();
      return;
    }
  }

  // 404
  render404();
}

function matchRoute(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

window.addEventListener('popstate', handleRoute);

// Render helpers
const app = document.getElementById('app');

function render() {
  if (!currentRoute) return;
  currentRoute.handler(currentRoute.params);
}

function render404() {
  app.innerHTML = `
    <div class="auth-page">
      <div class="card auth-card text-center">
        <h1>404</h1>
        <p class="text-muted mt-1">Page not found</p>
        <a href="/" class="btn btn-primary mt-2">Go Home</a>
      </div>
    </div>
  `;
}

function renderHeader(title = '') {
  return `
    <header class="header">
      <div class="container header-content">
        <a href="/" class="logo">
          <span class="logo-icon">SR</span>
          <span>Spaced Repetition</span>
        </a>
        <div class="header-actions">
          <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
            <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          </button>
          ${state.user ? `
            <div class="user-menu">
              ${state.user.avatar_url
                ? `<img src="${escapeHtml(state.user.avatar_url)}" alt="Avatar" class="user-avatar" title="${escapeHtml(state.user.name || state.user.email)}">`
                : `<div class="user-avatar user-avatar-default" title="${escapeHtml(state.user.name || state.user.email)}">${icons.user}</div>`
              }
              <button class="btn btn-ghost btn-sm" onclick="logout()">Logout</button>
            </div>
          ` : ''}
        </div>
      </div>
    </header>
  `;
}

// Icons
const icons = {
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="80" height="80"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  cards: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="64" height="64"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>`,
  upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  github: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
  google: `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
};

// Auth functions
async function login(email, password) {
  try {
    const data = await api('/auth/signin', {
      method: 'POST',
      body: { email, password },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    navigate('/');
  } catch (err) {
    throw err;
  }
}

async function signup(email, password, name) {
  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: { email, password, name },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    navigate('/');
  } catch (err) {
    throw err;
  }
}

async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (err) {
    // Ignore errors
  }
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  navigate('/login');
}

async function checkAuth() {
  if (!state.token) return false;
  try {
    const data = await api('/auth/me');
    state.user = data.user;
    return !!data.user;
  } catch (err) {
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    return false;
  }
}

async function loadProviders() {
  try {
    state.providers = await api('/auth/providers');
  } catch (err) {
    // Use defaults
  }
}

// Markdown rendering
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text || '');
  }
  // Fallback: escape HTML and convert newlines
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Routes
route('/login', async () => {
  await loadProviders();
  app.innerHTML = `
    <div class="auth-page">
      <div class="card auth-card">
        <div class="auth-header">
          <div class="logo" style="justify-content: center; margin-bottom: 1rem;">
            <span class="logo-icon">SR</span>
            <span>Spaced Repetition</span>
          </div>
          <p class="text-muted">Sign in to continue</p>
        </div>

        <div id="auth-error"></div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input type="email" id="email" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input type="password" id="password" class="form-input" required>
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%">Sign In</button>
        </form>

        ${state.providers.github || state.providers.google ? `
          <div class="auth-divider"><span>or</span></div>
          <div class="oauth-buttons">
            ${state.providers.github ? `
              <a href="/api/auth/github" class="oauth-btn">
                ${icons.github}
                Continue with GitHub
              </a>
            ` : ''}
            ${state.providers.google ? `
              <a href="/api/auth/google" class="oauth-btn">
                ${icons.google}
                Continue with Google
              </a>
            ` : ''}
          </div>
        ` : ''}

        <div class="auth-footer">
          Don't have an account? <a href="/signup">Sign up</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('auth-error');

    try {
      await login(email, password);
    } catch (err) {
      errorDiv.innerHTML = `<div class="error-message">${err.message}</div>`;
    }
  });
});

route('/signup', async () => {
  await loadProviders();
  app.innerHTML = `
    <div class="auth-page">
      <div class="card auth-card">
        <div class="auth-header">
          <div class="logo" style="justify-content: center; margin-bottom: 1rem;">
            <span class="logo-icon">SR</span>
            <span>Spaced Repetition</span>
          </div>
          <p class="text-muted">Create your account</p>
        </div>

        <div id="auth-error"></div>

        <form id="signup-form">
          <div class="form-group">
            <label class="form-label" for="name">Name (optional)</label>
            <input type="text" id="name" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input type="email" id="email" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input type="password" id="password" class="form-input" required minlength="8">
          </div>
          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%">Create Account</button>
        </form>

        ${state.providers.github || state.providers.google ? `
          <div class="auth-divider"><span>or</span></div>
          <div class="oauth-buttons">
            ${state.providers.github ? `
              <a href="/api/auth/github" class="oauth-btn">
                ${icons.github}
                Continue with GitHub
              </a>
            ` : ''}
            ${state.providers.google ? `
              <a href="/api/auth/google" class="oauth-btn">
                ${icons.google}
                Continue with Google
              </a>
            ` : ''}
          </div>
        ` : ''}

        <div class="auth-footer">
          Already have an account? <a href="/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('auth-error');

    try {
      await signup(email, password, name);
    } catch (err) {
      errorDiv.innerHTML = `<div class="error-message">${err.message}</div>`;
    }
  });
});

route('/', async () => {
  if (!await checkAuth()) {
    navigate('/login', true);
    return;
  }

  let decks = [];
  try {
    const data = await api('/decks');
    decks = data.decks;
  } catch (err) {
    console.error(err);
  }

  app.innerHTML = `
    ${renderHeader()}
    <main class="main">
      <div class="container">
        <div class="page-header">
          <h1>Your Decks</h1>
          <button class="btn btn-primary" onclick="showCreateDeckModal()">
            ${icons.plus} New Deck
          </button>
        </div>

        ${decks.length === 0 ? `
          <div class="empty-state">
            ${icons.cards}
            <h3>No decks yet</h3>
            <p>Create your first deck to start learning</p>
          </div>
        ` : `
          <div class="deck-grid">
            ${decks.map(deck => `
              <div class="card card-clickable deck-card" onclick="navigate('/deck/${deck.id}')">
                <div class="deck-info">
                  <h3>${escapeHtml(deck.name)}</h3>
                  <p>${deck.description ? escapeHtml(deck.description) : `${deck.card_count} cards`}</p>
                </div>
                <div class="deck-stats">
                  <div class="deck-stat">
                    <div class="deck-stat-value">${deck.card_count}</div>
                    <div class="deck-stat-label">Cards</div>
                  </div>
                  <div class="deck-stat stat-due">
                    <div class="deck-stat-value">${deck.due_count}</div>
                    <div class="deck-stat-label">Due</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </main>
  `;
});

route('/deck/:id', async (params) => {
  if (!await checkAuth()) {
    navigate('/login', true);
    return;
  }

  let deck, cards;
  try {
    const deckData = await api(`/decks/${params.id}`);
    deck = deckData.deck;
    const cardsData = await api(`/cards/deck/${params.id}`);
    cards = cardsData.cards;
  } catch (err) {
    console.error(err);
    navigate('/');
    return;
  }

  app.innerHTML = `
    ${renderHeader()}
    <main class="main">
      <div class="container">
        <div class="page-header">
          <div>
            <a href="/" class="text-muted">&larr; Back to decks</a>
            <h1 class="mt-1">${escapeHtml(deck.name)}</h1>
            ${deck.description ? `<p class="text-muted">${escapeHtml(deck.description)}</p>` : ''}
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${deck.due_count > 0 ? `
              <a href="/review/${deck.id}" class="btn btn-primary">
                Review (${deck.due_count})
              </a>
            ` : ''}
            <button class="btn btn-secondary" onclick="showCreateCardModal(${deck.id})">
              ${icons.plus} Add Card
            </button>
            <button class="btn btn-secondary" onclick="showImportModal(${deck.id})">
              ${icons.upload} Import
            </button>
            <button class="btn btn-ghost btn-icon" onclick="showEditDeckModal(${deck.id}, '${escapeHtml(deck.name)}', '${escapeHtml(deck.description || '')}')">
              ${icons.edit}
            </button>
            <button class="btn btn-ghost btn-icon" onclick="deleteDeck(${deck.id})">
              ${icons.trash}
            </button>
          </div>
        </div>

        ${cards.length === 0 ? `
          <div class="empty-state">
            ${icons.cards}
            <h3>No cards yet</h3>
            <p>Add your first card to this deck</p>
          </div>
        ` : `
          <div class="card-list">
            ${cards.map(card => `
              <div class="card-item">
                <div class="card-item-content">
                  <div class="card-item-front">${escapeHtml(truncate(card.front, 100))}</div>
                  <div class="card-item-back">${escapeHtml(truncate(card.back, 100))}</div>
                </div>
                <div class="card-item-actions">
                  <button class="btn btn-ghost btn-sm btn-icon" onclick="showEditCardModal(${card.id}, ${JSON.stringify(escapeHtml(card.front)).replace(/"/g, '&quot;')}, ${JSON.stringify(escapeHtml(card.back)).replace(/"/g, '&quot;')})">
                    ${icons.edit}
                  </button>
                  <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteCard(${card.id}, ${deck.id})">
                    ${icons.trash}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </main>
  `;
});

route('/review/:deckId', async (params) => {
  if (!await checkAuth()) {
    navigate('/login', true);
    return;
  }

  let dueCards = [];
  try {
    const data = await api(`/review/due?deckId=${params.deckId}`);
    dueCards = data.cards;
  } catch (err) {
    console.error(err);
    navigate('/');
    return;
  }

  if (dueCards.length === 0) {
    renderReviewComplete(params.deckId);
    return;
  }

  window.reviewState = {
    cards: dueCards,
    currentIndex: 0,
    showingAnswer: false,
    deckId: params.deckId,
  };

  renderReviewCard();
});

function renderReviewCard() {
  const { cards, currentIndex, showingAnswer, deckId } = window.reviewState;
  const card = cards[currentIndex];

  app.innerHTML = `
    ${renderHeader()}
    <main class="main">
      <div class="container review-container">
        <div class="review-progress">
          Card ${currentIndex + 1} of ${cards.length}
        </div>

        <div class="card review-card" onclick="revealAnswer()">
          <div class="review-card-content markdown-content">
            ${renderMarkdown(card.front)}
          </div>

          ${showingAnswer ? `
            <div class="review-divider"></div>
            <div class="review-answer markdown-content">
              ${renderMarkdown(card.back)}
            </div>
          ` : `
            <div class="review-card-hint">Click to reveal answer</div>
          `}
        </div>

        ${showingAnswer ? `
          <div class="review-buttons">
            <button class="review-btn review-btn-again" onclick="submitReview(1)">
              <span class="review-btn-label">Again</span>
              <span class="review-btn-interval">&lt; 1 min</span>
            </button>
            <button class="review-btn review-btn-hard" onclick="submitReview(3)">
              <span class="review-btn-label">Hard</span>
              <span class="review-btn-interval">${formatInterval(calculateNextInterval(card, 3))}</span>
            </button>
            <button class="review-btn review-btn-good" onclick="submitReview(5)">
              <span class="review-btn-label">Good</span>
              <span class="review-btn-interval">${formatInterval(calculateNextInterval(card, 5))}</span>
            </button>
          </div>
        ` : ''}
      </div>
    </main>
  `;
}

function revealAnswer() {
  if (!window.reviewState.showingAnswer) {
    window.reviewState.showingAnswer = true;
    renderReviewCard();
  }
}

function calculateNextInterval(card, quality) {
  let ef = card.ease_factor;
  let interval = card.interval;
  let reps = card.repetitions;

  if (quality < 3) {
    return 1;
  }

  if (reps === 0) return 1;
  if (reps === 1) return 6;

  // Adjust EF first
  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  return Math.round(interval * ef);
}

function formatInterval(days) {
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

async function submitReview(quality) {
  const { cards, currentIndex, deckId } = window.reviewState;
  const card = cards[currentIndex];

  try {
    await api('/review/submit', {
      method: 'POST',
      body: { cardId: card.id, quality },
    });

    // Move to next card
    if (currentIndex + 1 < cards.length) {
      window.reviewState.currentIndex++;
      window.reviewState.showingAnswer = false;
      renderReviewCard();
    } else {
      renderReviewComplete(deckId);
    }
  } catch (err) {
    console.error(err);
  }
}

function renderReviewComplete(deckId) {
  app.innerHTML = `
    ${renderHeader()}
    <main class="main">
      <div class="container">
        <div class="review-complete">
          ${icons.check}
          <h2>Review Complete!</h2>
          <p>You've reviewed all due cards in this deck.</p>
          <div style="display: flex; gap: 1rem; justify-content: center;">
            <a href="/deck/${deckId}" class="btn btn-secondary">Back to Deck</a>
            <a href="/" class="btn btn-primary">All Decks</a>
          </div>
        </div>
      </div>
    </main>
  `;
}

// Modal helpers
function showModal(title, content, footer) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'modal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">${content}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.body.appendChild(modal);
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.remove();
}

// Deck CRUD
window.showCreateDeckModal = function() {
  showModal('Create Deck', `
    <form id="create-deck-form">
      <div class="form-group">
        <label class="form-label" for="deck-name">Name</label>
        <input type="text" id="deck-name" class="form-input" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="deck-desc">Description (optional)</label>
        <input type="text" id="deck-desc" class="form-input">
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createDeck()">Create</button>
  `);
};

window.createDeck = async function() {
  const name = document.getElementById('deck-name').value;
  const description = document.getElementById('deck-desc').value;

  try {
    await api('/decks', {
      method: 'POST',
      body: { name, description },
    });
    closeModal();
    navigate('/');
  } catch (err) {
    alert(err.message);
  }
};

window.showEditDeckModal = function(id, name, description) {
  showModal('Edit Deck', `
    <form id="edit-deck-form">
      <div class="form-group">
        <label class="form-label" for="deck-name">Name</label>
        <input type="text" id="deck-name" class="form-input" value="${name}" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="deck-desc">Description (optional)</label>
        <input type="text" id="deck-desc" class="form-input" value="${description}">
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="updateDeck(${id})">Save</button>
  `);
};

window.updateDeck = async function(id) {
  const name = document.getElementById('deck-name').value;
  const description = document.getElementById('deck-desc').value;

  try {
    await api(`/decks/${id}`, {
      method: 'PUT',
      body: { name, description },
    });
    closeModal();
    navigate(`/deck/${id}`);
  } catch (err) {
    alert(err.message);
  }
};

window.deleteDeck = async function(id) {
  if (!confirm('Are you sure you want to delete this deck and all its cards?')) return;

  try {
    await api(`/decks/${id}`, { method: 'DELETE' });
    navigate('/');
  } catch (err) {
    alert(err.message);
  }
};

// Card CRUD
window.showCreateCardModal = function(deckId) {
  showModal('Add Card', `
    <form id="create-card-form">
      <div class="card-editor">
        <div class="card-editor-side">
          <h4>Front (Question)</h4>
          <textarea id="card-front" class="form-textarea" placeholder="Write your question in Markdown..." required></textarea>
        </div>
        <div class="card-editor-side">
          <h4>Back (Answer)</h4>
          <textarea id="card-back" class="form-textarea" placeholder="Write your answer in Markdown..." required></textarea>
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createCard(${deckId})">Add Card</button>
  `);
};

window.createCard = async function(deckId) {
  const front = document.getElementById('card-front').value;
  const back = document.getElementById('card-back').value;

  try {
    await api(`/cards/deck/${deckId}`, {
      method: 'POST',
      body: { front, back },
    });
    closeModal();
    navigate(`/deck/${deckId}`);
  } catch (err) {
    alert(err.message);
  }
};

window.showEditCardModal = function(id, front, back) {
  // Unescape the HTML entities for editing
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = front;
  const frontText = tempDiv.textContent;
  tempDiv.innerHTML = back;
  const backText = tempDiv.textContent;

  showModal('Edit Card', `
    <form id="edit-card-form">
      <div class="card-editor">
        <div class="card-editor-side">
          <h4>Front (Question)</h4>
          <textarea id="card-front" class="form-textarea" required>${escapeHtml(frontText)}</textarea>
        </div>
        <div class="card-editor-side">
          <h4>Back (Answer)</h4>
          <textarea id="card-back" class="form-textarea" required>${escapeHtml(backText)}</textarea>
        </div>
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="updateCard(${id})">Save</button>
  `);
};

window.updateCard = async function(id) {
  const front = document.getElementById('card-front').value;
  const back = document.getElementById('card-back').value;

  try {
    const data = await api(`/cards/${id}`, {
      method: 'PUT',
      body: { front, back },
    });
    closeModal();
    // Refresh current page
    handleRoute();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteCard = async function(id, deckId) {
  if (!confirm('Are you sure you want to delete this card?')) return;

  try {
    await api(`/cards/${id}`, { method: 'DELETE' });
    navigate(`/deck/${deckId}`);
  } catch (err) {
    alert(err.message);
  }
};

// Import
window.showImportModal = function(deckId) {
  showModal('Import Cards', `
    <form id="import-form">
      <div class="form-group">
        <label class="form-label" for="import-content">Paste cards in Hashcards format</label>
        <textarea id="import-content" class="form-textarea" style="min-height: 200px; font-family: monospace;" placeholder="Q: What is the capital of France?
A: Paris

Q: What is 2 + 2?
A: 4

C: The [mitochondria] is the powerhouse of the [cell]." required></textarea>
      </div>
      <details class="import-help">
        <summary>Format help</summary>
        <div class="import-help-content">
          <p><strong>Question/Answer cards:</strong></p>
          <pre>Q: Your question here
A: Your answer here</pre>
          <p><strong>Cloze deletions:</strong></p>
          <pre>C: The [answer] is hidden in [brackets].</pre>
          <p>Separate cards with blank lines or <code>---</code></p>
        </div>
      </details>
      <div id="import-error"></div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="importCards(${deckId})">Import</button>
  `);
};

window.importCards = async function(deckId) {
  const content = document.getElementById('import-content').value;
  const errorDiv = document.getElementById('import-error');

  try {
    const data = await api(`/cards/deck/${deckId}/import`, {
      method: 'POST',
      body: { content },
    });

    let message = `Imported ${data.imported} card${data.imported !== 1 ? 's' : ''}`;
    if (data.parseErrors && data.parseErrors.length > 0) {
      message += `\n\nWarnings:\n${data.parseErrors.join('\n')}`;
    }
    alert(message);
    closeModal();
    navigate(`/deck/${deckId}`);
  } catch (err) {
    let errorMessage = err.message;
    if (err.parseErrors) {
      errorMessage += '\n' + err.parseErrors.join('\n');
    }
    errorDiv.innerHTML = `<div class="error-message">${escapeHtml(errorMessage)}</div>`;
  }
};

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, length) {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

// Make functions available globally
window.navigate = navigate;
window.toggleTheme = toggleTheme;
window.logout = logout;
window.closeModal = closeModal;
window.revealAnswer = revealAnswer;
window.submitReview = submitReview;

// Initialize
applyTheme();
handleRoute();
