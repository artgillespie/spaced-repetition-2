import { Hono } from "hono";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";

const review = new Hono();

review.use("*", requireAuth);

/**
 * SM-2 Algorithm Implementation
 *
 * Quality ratings:
 * 0 - Complete blackout, no recall
 * 1 - Incorrect, but upon seeing answer, remembered
 * 2 - Incorrect, but answer seemed easy to recall
 * 3 - Correct, but with significant difficulty
 * 4 - Correct, with some hesitation
 * 5 - Perfect, instant recall
 *
 * If quality < 3, card is reset and shown again soon
 * If quality >= 3, interval is increased based on ease factor
 */
function calculateSM2(
  quality: number,
  easeFactor: number,
  interval: number,
  repetitions: number
): { easeFactor: number; interval: number; repetitions: number } {
  // Ensure quality is in valid range
  quality = Math.max(0, Math.min(5, Math.round(quality)));

  let newEaseFactor = easeFactor;
  let newInterval = interval;
  let newRepetitions = repetitions;

  if (quality < 3) {
    // Failed recall - reset
    newRepetitions = 0;
    newInterval = 1;
  } else {
    // Successful recall
    if (newRepetitions === 0) {
      newInterval = 1;
    } else if (newRepetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }
    newRepetitions += 1;
  }

  // Update ease factor using SM-2 formula
  newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Ease factor should not go below 1.3
  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3;
  }

  return {
    easeFactor: newEaseFactor,
    interval: newInterval,
    repetitions: newRepetitions,
  };
}

// Get cards due for review (optionally filtered by deck)
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

// Get review statistics
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

  const stats = db.query(`
    SELECT
      COUNT(*) as total_cards,
      COUNT(CASE WHEN date(c.due_date) <= date('now') THEN 1 END) as due_now,
      COUNT(CASE WHEN c.repetitions = 0 THEN 1 END) as new_cards,
      COUNT(CASE WHEN c.repetitions > 0 AND date(c.due_date) <= date('now') THEN 1 END) as review_cards
    ${baseQuery}
  `).get(...params) as {
    total_cards: number;
    due_now: number;
    new_cards: number;
    review_cards: number;
  };

  // Get cards due in next 7 days
  const upcoming = db.query(`
    SELECT
      date(c.due_date) as date,
      COUNT(*) as count
    ${baseQuery} AND date(c.due_date) > date('now') AND date(c.due_date) <= date('now', '+7 days')
    GROUP BY date(c.due_date)
    ORDER BY date(c.due_date)
  `).all(...params);

  return c.json({ stats, upcoming });
});

// Submit a review
review.post("/submit", async (c) => {
  const user = c.get("user");
  const { cardId, quality } = await c.req.json();

  if (typeof cardId !== "number" || typeof quality !== "number") {
    return c.json({ error: "cardId and quality are required" }, 400);
  }

  if (quality < 0 || quality > 5) {
    return c.json({ error: "Quality must be between 0 and 5" }, 400);
  }

  // Verify ownership and get current card state
  const card = db.query(`
    SELECT c.* FROM cards c
    JOIN decks d ON c.deck_id = d.id
    WHERE c.id = ? AND d.user_id = ?
  `).get(cardId, user.id) as {
    id: number;
    ease_factor: number;
    interval: number;
    repetitions: number;
  } | null;

  if (!card) {
    return c.json({ error: "Card not found" }, 404);
  }

  // Calculate new SM-2 values
  const { easeFactor, interval, repetitions } = calculateSM2(
    quality,
    card.ease_factor,
    card.interval,
    card.repetitions
  );

  // Calculate new due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + interval);

  // Update card
  db.run(
    `UPDATE cards
     SET ease_factor = ?, interval = ?, repetitions = ?, due_date = ?
     WHERE id = ?`,
    [easeFactor, interval, repetitions, dueDate.toISOString(), cardId]
  );

  // Record in history
  db.run(
    `INSERT INTO review_history (card_id, quality, ease_factor, interval)
     VALUES (?, ?, ?, ?)`,
    [cardId, quality, easeFactor, interval]
  );

  // Return updated card
  const updatedCard = db.query("SELECT * FROM cards WHERE id = ?").get(cardId);
  return c.json({ card: updatedCard });
});

// Get review history for a card
review.get("/history/:cardId", (c) => {
  const user = c.get("user");
  const cardId = parseInt(c.req.param("cardId"));

  // Verify ownership
  const card = db.query(`
    SELECT c.id FROM cards c
    JOIN decks d ON c.deck_id = d.id
    WHERE c.id = ? AND d.user_id = ?
  `).get(cardId, user.id);

  if (!card) {
    return c.json({ error: "Card not found" }, 404);
  }

  const history = db.query(`
    SELECT * FROM review_history
    WHERE card_id = ?
    ORDER BY reviewed_at DESC
    LIMIT 50
  `).all(cardId);

  return c.json({ history });
});

export { review };
