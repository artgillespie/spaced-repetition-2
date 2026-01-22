import { Hono } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";

// Create a test app with injected database
export function createTestApp(db: Database) {
  const app = new Hono();

  // CORS for development
  app.use("/api/*", cors());

  // Create auth routes with injected db
  const auth = createAuthRoutes(db);
  const decks = createDeckRoutes(db);
  const cards = createCardRoutes(db);
  const review = createReviewRoutes(db);

  app.route("/api/auth", auth);
  app.route("/api/decks", decks);
  app.route("/api/cards", cards);
  app.route("/api/review", review);

  return app;
}

// Auth utilities with injected db
function createAuthHelpers(db: Database) {
  function generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPassword(password: string): Promise<string> {
    return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
  }

  async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return await Bun.password.verify(password, hash);
  }

  function createSession(userId: number): string {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    db.run("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)", [
      userId,
      token,
      expiresAt.toISOString(),
    ]);
    return token;
  }

  function getSessionUser(
    token: string
  ): { id: number; email: string; name: string | null } | null {
    return db
      .query(
        `
      SELECT u.id, u.email, u.name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `
      )
      .get(token) as { id: number; email: string; name: string | null } | null;
  }

  function deleteSession(token: string): void {
    db.run("DELETE FROM sessions WHERE token = ?", [token]);
  }

  function createUser(
    email: string,
    passwordHash: string | null,
    name: string | null = null
  ): number {
    const result = db.run(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      [email, passwordHash, name]
    );
    return Number(result.lastInsertRowid);
  }

  function getUserByEmail(
    email: string
  ): { id: number; email: string; password_hash: string | null; name: string | null } | null {
    return db
      .query("SELECT id, email, password_hash, name FROM users WHERE email = ?")
      .get(email) as any;
  }

  return {
    generateToken,
    hashPassword,
    verifyPassword,
    createSession,
    getSessionUser,
    deleteSession,
    createUser,
    getUserByEmail,
  };
}

// Auth middleware with injected db
function createRequireAuth(db: Database) {
  const { getSessionUser } = createAuthHelpers(db);

  return async function requireAuth(c: any, next: any) {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const user = getSessionUser(token);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", user);
    await next();
  };
}

// Auth routes
function createAuthRoutes(db: Database) {
  const auth = new Hono();
  const helpers = createAuthHelpers(db);

  auth.get("/me", async (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return c.json({ user: null });
    }
    const user = helpers.getSessionUser(token);
    return c.json({ user });
  });

  auth.get("/providers", (c) => {
    return c.json({ email: true, github: false, google: false });
  });

  auth.post("/signup", async (c) => {
    const { email, password, name } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const existing = helpers.getUserByEmail(email);
    if (existing) {
      return c.json({ error: "Email already registered" }, 400);
    }

    const passwordHash = await helpers.hashPassword(password);
    const userId = helpers.createUser(email, passwordHash, name);
    const token = helpers.createSession(userId);

    return c.json({ token, user: { id: userId, email, name } });
  });

  auth.post("/signin", async (c) => {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = helpers.getUserByEmail(email);
    if (!user || !user.password_hash) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const valid = await helpers.verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const token = helpers.createSession(user.id);
    return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  auth.post("/logout", (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token) {
      helpers.deleteSession(token);
    }
    return c.json({ success: true });
  });

  return auth;
}

// Deck routes
function createDeckRoutes(db: Database) {
  const decks = new Hono();
  const requireAuth = createRequireAuth(db);

  decks.use("*", requireAuth);

  decks.get("/", (c) => {
    const user = c.get("user");
    const rows = db
      .query(
        `
      SELECT
        d.id,
        d.name,
        d.description,
        d.created_at,
        COUNT(c.id) as card_count,
        COUNT(CASE WHEN date(c.due_date) <= date('now') THEN 1 END) as due_count
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id
      WHERE d.user_id = ?
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `
      )
      .all(user.id);

    return c.json({ decks: rows });
  });

  decks.post("/", async (c) => {
    const user = c.get("user");
    const { name, description } = await c.req.json();

    if (!name?.trim()) {
      return c.json({ error: "Deck name is required" }, 400);
    }

    const result = db.run(
      "INSERT INTO decks (user_id, name, description) VALUES (?, ?, ?)",
      [user.id, name.trim(), description?.trim() || null]
    );

    const deck = db.query("SELECT * FROM decks WHERE id = ?").get(result.lastInsertRowid);
    return c.json({ deck }, 201);
  });

  decks.get("/:id", (c) => {
    const user = c.get("user");
    const deckId = parseInt(c.req.param("id"));

    const deck = db
      .query(
        `
      SELECT
        d.*,
        COUNT(c.id) as card_count,
        COUNT(CASE WHEN date(c.due_date) <= date('now') THEN 1 END) as due_count
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id
      WHERE d.id = ? AND d.user_id = ?
      GROUP BY d.id
    `
      )
      .get(deckId, user.id);

    if (!deck) {
      return c.json({ error: "Deck not found" }, 404);
    }

    return c.json({ deck });
  });

  decks.put("/:id", async (c) => {
    const user = c.get("user");
    const deckId = parseInt(c.req.param("id"));
    const { name, description } = await c.req.json();

    const existing = db
      .query("SELECT id FROM decks WHERE id = ? AND user_id = ?")
      .get(deckId, user.id);
    if (!existing) {
      return c.json({ error: "Deck not found" }, 404);
    }

    if (!name?.trim()) {
      return c.json({ error: "Deck name is required" }, 400);
    }

    db.run("UPDATE decks SET name = ?, description = ? WHERE id = ?", [
      name.trim(),
      description?.trim() || null,
      deckId,
    ]);

    const deck = db.query("SELECT * FROM decks WHERE id = ?").get(deckId);
    return c.json({ deck });
  });

  decks.delete("/:id", (c) => {
    const user = c.get("user");
    const deckId = parseInt(c.req.param("id"));

    const result = db.run("DELETE FROM decks WHERE id = ? AND user_id = ?", [deckId, user.id]);

    if (result.changes === 0) {
      return c.json({ error: "Deck not found" }, 404);
    }

    return c.json({ success: true });
  });

  return decks;
}

// Hashcards parser (inline for test isolation)
function parseHashcards(input: string): { cards: { front: string; back: string }[]; errors: string[] } {
  const cards: { front: string; back: string }[] = [];
  const errors: string[] = [];

  const blocks = input
    .replace(/\r\n/g, '\n')
    .split(/\n(?:\s*\n|---\s*\n)/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockNum = i + 1;

    if (block.match(/^Q:/im)) {
      const qaMatch = block.match(/^Q:\s*([\s\S]*?)\s*(?:^A:\s*([\s\S]*))?$/im);
      if (qaMatch && qaMatch[1]?.trim() && qaMatch[2]?.trim()) {
        cards.push({ front: qaMatch[1].trim(), back: qaMatch[2].trim() });
      } else {
        errors.push(`Block ${blockNum}: Q: card missing A: answer`);
      }
      continue;
    }

    if (block.match(/^C:/im)) {
      const clozeMatch = block.match(/^C:\s*([\s\S]*)$/im);
      if (clozeMatch) {
        const content = clozeMatch[1].trim();
        const deletions = content.match(/\[([^\]]+)\]/g);
        if (deletions && deletions.length > 0) {
          const front = content.replace(/\[([^\]]+)\]/g, '[...]');
          const back = content.replace(/\[([^\]]+)\]/g, '$1');
          cards.push({ front, back });
        } else {
          errors.push(`Block ${blockNum}: C: card has no [deletions]`);
        }
      }
      continue;
    }

    if (block.length > 0) {
      errors.push(`Block ${blockNum}: Unknown format (expected Q: or C:)`);
    }
  }

  return { cards, errors };
}

// Card routes
function createCardRoutes(db: Database) {
  const cards = new Hono();
  const requireAuth = createRequireAuth(db);

  cards.use("*", requireAuth);

  function verifyDeckOwnership(deckId: number, userId: number): boolean {
    const deck = db
      .query("SELECT id FROM decks WHERE id = ? AND user_id = ?")
      .get(deckId, userId);
    return !!deck;
  }

  cards.get("/deck/:deckId", (c) => {
    const user = c.get("user");
    const deckId = parseInt(c.req.param("deckId"));

    if (!verifyDeckOwnership(deckId, user.id)) {
      return c.json({ error: "Deck not found" }, 404);
    }

    const rows = db
      .query(
        `
      SELECT * FROM cards
      WHERE deck_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(deckId);

    return c.json({ cards: rows });
  });

  cards.post("/deck/:deckId", async (c) => {
    const user = c.get("user");
    const deckId = parseInt(c.req.param("deckId"));
    const { front, back } = await c.req.json();

    if (!verifyDeckOwnership(deckId, user.id)) {
      return c.json({ error: "Deck not found" }, 404);
    }

    if (!front?.trim() || !back?.trim()) {
      return c.json({ error: "Front and back content are required" }, 400);
    }

    const result = db.run(
      `INSERT INTO cards (deck_id, front, back, due_date)
       VALUES (?, ?, ?, datetime('now'))`,
      [deckId, front.trim(), back.trim()]
    );

    const card = db.query("SELECT * FROM cards WHERE id = ?").get(result.lastInsertRowid);
    return c.json({ card }, 201);
  });

  cards.post("/deck/:deckId/import", async (c) => {
    const user = c.get("user");
    const deckId = parseInt(c.req.param("deckId"));
    const { content } = await c.req.json();

    if (!verifyDeckOwnership(deckId, user.id)) {
      return c.json({ error: "Deck not found" }, 404);
    }

    if (!content?.trim()) {
      return c.json({ error: "Content is required" }, 400);
    }

    const { cards: parsedCards, errors } = parseHashcards(content);

    if (parsedCards.length === 0) {
      return c.json({
        error: "No valid cards found",
        parseErrors: errors
      }, 400);
    }

    const insertedCards = [];
    for (const card of parsedCards) {
      const result = db.run(
        `INSERT INTO cards (deck_id, front, back, due_date)
         VALUES (?, ?, ?, datetime('now'))`,
        [deckId, card.front, card.back]
      );
      const inserted = db.query("SELECT * FROM cards WHERE id = ?").get(result.lastInsertRowid);
      insertedCards.push(inserted);
    }

    return c.json({
      imported: insertedCards.length,
      cards: insertedCards,
      parseErrors: errors.length > 0 ? errors : undefined
    }, 201);
  });

  cards.get("/:id", (c) => {
    const user = c.get("user");
    const cardId = parseInt(c.req.param("id"));

    const card = db
      .query(
        `
      SELECT c.* FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE c.id = ? AND d.user_id = ?
    `
      )
      .get(cardId, user.id);

    if (!card) {
      return c.json({ error: "Card not found" }, 404);
    }

    return c.json({ card });
  });

  cards.put("/:id", async (c) => {
    const user = c.get("user");
    const cardId = parseInt(c.req.param("id"));
    const { front, back } = await c.req.json();

    const existing = db
      .query(
        `
      SELECT c.id FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE c.id = ? AND d.user_id = ?
    `
      )
      .get(cardId, user.id);

    if (!existing) {
      return c.json({ error: "Card not found" }, 404);
    }

    if (!front?.trim() || !back?.trim()) {
      return c.json({ error: "Front and back content are required" }, 400);
    }

    db.run("UPDATE cards SET front = ?, back = ?, updated_at = datetime('now') WHERE id = ?", [
      front.trim(),
      back.trim(),
      cardId,
    ]);

    const card = db.query("SELECT * FROM cards WHERE id = ?").get(cardId);
    return c.json({ card });
  });

  cards.delete("/:id", (c) => {
    const user = c.get("user");
    const cardId = parseInt(c.req.param("id"));

    const result = db.run(
      `
      DELETE FROM cards
      WHERE id = ? AND deck_id IN (SELECT id FROM decks WHERE user_id = ?)
    `,
      [cardId, user.id]
    );

    if (result.changes === 0) {
      return c.json({ error: "Card not found" }, 404);
    }

    return c.json({ success: true });
  });

  return cards;
}

// Review routes with SM-2 algorithm
function createReviewRoutes(db: Database) {
  const review = new Hono();
  const requireAuth = createRequireAuth(db);

  review.use("*", requireAuth);

  function calculateSM2(
    quality: number,
    easeFactor: number,
    interval: number,
    repetitions: number
  ): { easeFactor: number; interval: number; repetitions: number } {
    quality = Math.max(0, Math.min(5, Math.round(quality)));

    let newEaseFactor = easeFactor;
    let newInterval = interval;
    let newRepetitions = repetitions;

    if (quality < 3) {
      newRepetitions = 0;
      newInterval = 1;
    } else {
      if (newRepetitions === 0) {
        newInterval = 1;
      } else if (newRepetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(interval * easeFactor);
      }
      newRepetitions += 1;
    }

    newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    if (newEaseFactor < 1.3) {
      newEaseFactor = 1.3;
    }

    return {
      easeFactor: newEaseFactor,
      interval: newInterval,
      repetitions: newRepetitions,
    };
  }

  review.get("/due", (c) => {
    const user = c.get("user");
    const deckId = c.req.query("deckId");

    let query = `
      SELECT c.*, d.name as deck_name
      FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE d.user_id = ? AND date(c.due_date) <= date('now')
    `;
    const params: (string | number)[] = [user.id];

    if (deckId) {
      query += " AND c.deck_id = ?";
      params.push(parseInt(deckId));
    }

    query += " ORDER BY c.due_date ASC LIMIT 50";

    const cards = db.query(query).all(...params);

    return c.json({ cards });
  });

  review.get("/stats", (c) => {
    const user = c.get("user");
    const deckId = c.req.query("deckId");

    let baseQuery = `
      FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE d.user_id = ?
    `;
    const params: (string | number)[] = [user.id];

    if (deckId) {
      baseQuery += " AND c.deck_id = ?";
      params.push(parseInt(deckId));
    }

    const stats = db
      .query(
        `
      SELECT
        COUNT(*) as total_cards,
        COUNT(CASE WHEN date(c.due_date) <= date('now') THEN 1 END) as due_now,
        COUNT(CASE WHEN c.repetitions = 0 THEN 1 END) as new_cards,
        COUNT(CASE WHEN c.repetitions > 0 AND date(c.due_date) <= date('now') THEN 1 END) as review_cards
      ${baseQuery}
    `
      )
      .get(...params);

    const upcoming = db
      .query(
        `
      SELECT
        date(c.due_date) as date,
        COUNT(*) as count
      ${baseQuery} AND date(c.due_date) > date('now') AND date(c.due_date) <= date('now', '+7 days')
      GROUP BY date(c.due_date)
      ORDER BY date(c.due_date)
    `
      )
      .all(...params);

    return c.json({ stats, upcoming });
  });

  review.post("/submit", async (c) => {
    const user = c.get("user");
    const { cardId, quality } = await c.req.json();

    if (typeof cardId !== "number" || typeof quality !== "number") {
      return c.json({ error: "cardId and quality are required" }, 400);
    }

    if (quality < 0 || quality > 5) {
      return c.json({ error: "Quality must be between 0 and 5" }, 400);
    }

    const card = db
      .query(
        `
      SELECT c.* FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE c.id = ? AND d.user_id = ?
    `
      )
      .get(cardId, user.id) as {
      id: number;
      ease_factor: number;
      interval: number;
      repetitions: number;
    } | null;

    if (!card) {
      return c.json({ error: "Card not found" }, 404);
    }

    const { easeFactor, interval, repetitions } = calculateSM2(
      quality,
      card.ease_factor,
      card.interval,
      card.repetitions
    );

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + interval);

    db.run(
      `UPDATE cards
       SET ease_factor = ?, interval = ?, repetitions = ?, due_date = ?
       WHERE id = ?`,
      [easeFactor, interval, repetitions, dueDate.toISOString(), cardId]
    );

    db.run(
      `INSERT INTO review_history (card_id, quality, ease_factor, interval)
       VALUES (?, ?, ?, ?)`,
      [cardId, quality, easeFactor, interval]
    );

    const updatedCard = db.query("SELECT * FROM cards WHERE id = ?").get(cardId);
    return c.json({ card: updatedCard });
  });

  review.get("/history/:cardId", (c) => {
    const user = c.get("user");
    const cardId = parseInt(c.req.param("cardId"));

    const card = db
      .query(
        `
      SELECT c.id FROM cards c
      JOIN decks d ON c.deck_id = d.id
      WHERE c.id = ? AND d.user_id = ?
    `
      )
      .get(cardId, user.id);

    if (!card) {
      return c.json({ error: "Card not found" }, 404);
    }

    const history = db
      .query(
        `
      SELECT * FROM review_history
      WHERE card_id = ?
      ORDER BY reviewed_at DESC
      LIMIT 50
    `
      )
      .all(cardId);

    return c.json({ history });
  });

  return review;
}

// Export SM-2 calculator for unit testing
export function calculateSM2(
  quality: number,
  easeFactor: number,
  interval: number,
  repetitions: number
): { easeFactor: number; interval: number; repetitions: number } {
  quality = Math.max(0, Math.min(5, Math.round(quality)));

  let newEaseFactor = easeFactor;
  let newInterval = interval;
  let newRepetitions = repetitions;

  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1;
  } else {
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
    newRepetitions += 1;
  }

  newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3;
  }

  return {
    easeFactor: newEaseFactor,
    interval: newInterval,
    repetitions: newRepetitions,
  };
}
