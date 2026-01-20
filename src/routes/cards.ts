import { Hono } from "hono";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { parseHashcards } from "../import/hashcards";

const cards = new Hono();

cards.use("*", requireAuth);

// Helper to verify deck ownership
function verifyDeckOwnership(deckId: number, userId: number): boolean {
  const deck = db.query("SELECT id FROM decks WHERE id = ? AND user_id = ?").get(deckId, userId);
  return !!deck;
}

// List all cards in a deck
cards.get("/deck/:deckId", (c) => {
  const user = c.get("user");
  const deckId = parseInt(c.req.param("deckId"));

  if (!verifyDeckOwnership(deckId, user.id)) {
    return c.json({ error: "Deck not found" }, 404);
  }

  const rows = db.query(`
    SELECT * FROM cards
    WHERE deck_id = ?
    ORDER BY created_at DESC
  `).all(deckId);

  return c.json({ cards: rows });
});

// Create a new card
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

// Import cards from Hashcards format
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

  // Insert all valid cards
  const insertStmt = db.query(
    `INSERT INTO cards (deck_id, front, back, due_date)
     VALUES (?, ?, ?, datetime('now'))`
  );

  const insertedCards = [];
  for (const card of parsedCards) {
    const result = db.run(insertStmt, [deckId, card.front, card.back]);
    const inserted = db.query("SELECT * FROM cards WHERE id = ?").get(result.lastInsertRowid);
    insertedCards.push(inserted);
  }

  return c.json({
    imported: insertedCards.length,
    cards: insertedCards,
    parseErrors: errors.length > 0 ? errors : undefined
  }, 201);
});

// Get a single card
cards.get("/:id", (c) => {
  const user = c.get("user");
  const cardId = parseInt(c.req.param("id"));

  const card = db.query(`
    SELECT c.* FROM cards c
    JOIN decks d ON c.deck_id = d.id
    WHERE c.id = ? AND d.user_id = ?
  `).get(cardId, user.id);

  if (!card) {
    return c.json({ error: "Card not found" }, 404);
  }

  return c.json({ card });
});

// Update a card
cards.put("/:id", async (c) => {
  const user = c.get("user");
  const cardId = parseInt(c.req.param("id"));
  const { front, back } = await c.req.json();

  // Check ownership via deck
  const existing = db.query(`
    SELECT c.id FROM cards c
    JOIN decks d ON c.deck_id = d.id
    WHERE c.id = ? AND d.user_id = ?
  `).get(cardId, user.id);

  if (!existing) {
    return c.json({ error: "Card not found" }, 404);
  }

  if (!front?.trim() || !back?.trim()) {
    return c.json({ error: "Front and back content are required" }, 400);
  }

  db.run(
    "UPDATE cards SET front = ?, back = ?, updated_at = datetime('now') WHERE id = ?",
    [front.trim(), back.trim(), cardId]
  );

  const card = db.query("SELECT * FROM cards WHERE id = ?").get(cardId);
  return c.json({ card });
});

// Delete a card
cards.delete("/:id", (c) => {
  const user = c.get("user");
  const cardId = parseInt(c.req.param("id"));

  // Check ownership and delete
  const result = db.run(`
    DELETE FROM cards
    WHERE id = ? AND deck_id IN (SELECT id FROM decks WHERE user_id = ?)
  `, [cardId, user.id]);

  if (result.changes === 0) {
    return c.json({ error: "Card not found" }, 404);
  }

  return c.json({ success: true });
});

export { cards };
