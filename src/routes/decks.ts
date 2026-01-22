import { Hono } from "hono";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";

const decks = new Hono();

// All deck routes require authentication
decks.use("*", requireAuth);

// List all decks for the current user
decks.get("/", (c) => {
  const user = c.get("user");

  const rows = db.query(`
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
  `).all(user.id);

  return c.json({ decks: rows });
});

// Create a new deck
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

// Get a single deck
decks.get("/:id", (c) => {
  const user = c.get("user");
  const deckId = parseInt(c.req.param("id"));

  const deck = db.query(`
    SELECT
      d.*,
      COUNT(c.id) as card_count,
      COUNT(CASE WHEN date(c.due_date) <= date('now') THEN 1 END) as due_count
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    WHERE d.id = ? AND d.user_id = ?
    GROUP BY d.id
  `).get(deckId, user.id);

  if (!deck) {
    return c.json({ error: "Deck not found" }, 404);
  }

  return c.json({ deck });
});

// Update a deck
decks.put("/:id", async (c) => {
  const user = c.get("user");
  const deckId = parseInt(c.req.param("id"));
  const { name, description } = await c.req.json();

  // Check ownership
  const existing = db.query("SELECT id FROM decks WHERE id = ? AND user_id = ?").get(deckId, user.id);
  if (!existing) {
    return c.json({ error: "Deck not found" }, 404);
  }

  if (!name?.trim()) {
    return c.json({ error: "Deck name is required" }, 400);
  }

  db.run(
    "UPDATE decks SET name = ?, description = ? WHERE id = ?",
    [name.trim(), description?.trim() || null, deckId]
  );

  const deck = db.query("SELECT * FROM decks WHERE id = ?").get(deckId);
  return c.json({ deck });
});

// Delete a deck
decks.delete("/:id", (c) => {
  const user = c.get("user");
  const deckId = parseInt(c.req.param("id"));

  const result = db.run("DELETE FROM decks WHERE id = ? AND user_id = ?", [deckId, user.id]);

  if (result.changes === 0) {
    return c.json({ error: "Deck not found" }, 404);
  }

  return c.json({ success: true });
});

export { decks };
