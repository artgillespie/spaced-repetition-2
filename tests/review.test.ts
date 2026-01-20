import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestApp, calculateSM2 } from "./app";
import {
  createTestDb,
  createTestUser,
  createTestSession,
  createTestDeck,
  createTestCard,
  authRequest,
} from "./setup";

describe("SM-2 Algorithm", () => {
  describe("calculateSM2", () => {
    test("resets card on failed recall (quality < 3)", () => {
      const result = calculateSM2(2, 2.5, 10, 5);

      expect(result.repetitions).toBe(0);
      expect(result.interval).toBe(1);
    });

    test("first successful review sets interval to 1", () => {
      const result = calculateSM2(4, 2.5, 0, 0);

      expect(result.repetitions).toBe(1);
      expect(result.interval).toBe(1);
    });

    test("second successful review sets interval to 6", () => {
      const result = calculateSM2(4, 2.5, 1, 1);

      expect(result.repetitions).toBe(2);
      expect(result.interval).toBe(6);
    });

    test("subsequent reviews multiply interval by ease factor", () => {
      const result = calculateSM2(4, 2.5, 6, 2);

      expect(result.repetitions).toBe(3);
      expect(result.interval).toBe(15); // round(6 * 2.5) = 15
    });

    test("perfect recall (quality=5) increases ease factor", () => {
      const result = calculateSM2(5, 2.5, 6, 2);

      expect(result.easeFactor).toBeGreaterThan(2.5);
      expect(result.easeFactor).toBeCloseTo(2.6, 1);
    });

    test("difficult recall (quality=3) decreases ease factor", () => {
      const result = calculateSM2(3, 2.5, 6, 2);

      expect(result.easeFactor).toBeLessThan(2.5);
    });

    test("ease factor never goes below 1.3", () => {
      // Multiple difficult reviews
      let ef = 2.5;
      for (let i = 0; i < 20; i++) {
        const result = calculateSM2(3, ef, 6, 2);
        ef = result.easeFactor;
      }

      expect(ef).toBeGreaterThanOrEqual(1.3);
    });

    test("clamps quality to valid range", () => {
      const resultLow = calculateSM2(-1, 2.5, 0, 0);
      expect(resultLow.repetitions).toBe(0); // -1 clamped to 0, which is < 3

      const resultHigh = calculateSM2(10, 2.5, 0, 0);
      expect(resultHigh.repetitions).toBe(1); // 10 clamped to 5, which is >= 3
    });
  });
});

describe("Review API", () => {
  let db: Database;
  let app: ReturnType<typeof createTestApp>;
  let userId: number;
  let token: string;
  let deckId: number;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
    userId = createTestUser(db);
    token = createTestSession(db, userId);
    deckId = createTestDeck(db, userId);
  });

  describe("GET /api/review/due", () => {
    test("returns cards that are due", async () => {
      // Create a card due now
      createTestCard(db, deckId, "Due Card", "Answer");

      // Create a card due in the future
      const futureCardId = createTestCard(db, deckId, "Future Card", "Answer");
      db.run("UPDATE cards SET due_date = datetime('now', '+1 day') WHERE id = ?", [futureCardId]);

      const res = await authRequest(app, "GET", "/api/review/due", token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.cards).toHaveLength(1);
      expect(data.cards[0].front).toBe("Due Card");
    });

    test("filters by deck when deckId provided", async () => {
      const deck2Id = createTestDeck(db, userId, "Second Deck");

      createTestCard(db, deckId, "Deck 1 Card", "Answer");
      createTestCard(db, deck2Id, "Deck 2 Card", "Answer");

      const res = await authRequest(app, "GET", `/api/review/due?deckId=${deckId}`, token);
      const data = await res.json();

      expect(data.cards).toHaveLength(1);
      expect(data.cards[0].front).toBe("Deck 1 Card");
    });

    test("returns empty array when no cards are due", async () => {
      const cardId = createTestCard(db, deckId);
      db.run("UPDATE cards SET due_date = datetime('now', '+1 day') WHERE id = ?", [cardId]);

      const res = await authRequest(app, "GET", "/api/review/due", token);
      const data = await res.json();

      expect(data.cards).toEqual([]);
    });

    test("does not return other users' cards", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);
      createTestCard(db, otherDeckId);

      const res = await authRequest(app, "GET", "/api/review/due", token);
      const data = await res.json();

      expect(data.cards).toEqual([]);
    });
  });

  describe("GET /api/review/stats", () => {
    test("returns correct statistics", async () => {
      // Create cards with different states
      createTestCard(db, deckId, "Due 1", "A"); // due now, new
      createTestCard(db, deckId, "Due 2", "A"); // due now, new

      const reviewedCardId = createTestCard(db, deckId, "Reviewed", "A");
      db.run("UPDATE cards SET repetitions = 3, due_date = datetime('now') WHERE id = ?", [
        reviewedCardId,
      ]);

      const futureCardId = createTestCard(db, deckId, "Future", "A");
      db.run("UPDATE cards SET due_date = datetime('now', '+1 day') WHERE id = ?", [futureCardId]);

      const res = await authRequest(app, "GET", "/api/review/stats", token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.stats.total_cards).toBe(4);
      expect(data.stats.due_now).toBe(3); // 2 new + 1 reviewed
      expect(data.stats.new_cards).toBe(3); // repetitions = 0
      expect(data.stats.review_cards).toBe(1); // repetitions > 0 and due
    });

    test("filters stats by deck", async () => {
      const deck2Id = createTestDeck(db, userId, "Second Deck");

      createTestCard(db, deckId);
      createTestCard(db, deckId);
      createTestCard(db, deck2Id);

      const res = await authRequest(app, "GET", `/api/review/stats?deckId=${deckId}`, token);
      const data = await res.json();

      expect(data.stats.total_cards).toBe(2);
    });
  });

  describe("POST /api/review/submit", () => {
    test("updates card after successful review", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId,
        quality: 4,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.card.repetitions).toBe(1);
      expect(data.card.interval).toBe(1);
      expect(new Date(data.card.due_date).getTime()).toBeGreaterThan(Date.now());
    });

    test("resets card after failed review", async () => {
      const cardId = createTestCard(db, deckId);
      db.run("UPDATE cards SET repetitions = 5, interval = 30 WHERE id = ?", [cardId]);

      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId,
        quality: 1,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.card.repetitions).toBe(0);
      expect(data.card.interval).toBe(1);
    });

    test("records review in history", async () => {
      const cardId = createTestCard(db, deckId);

      await authRequest(app, "POST", "/api/review/submit", token, {
        cardId,
        quality: 4,
      });

      const history = db.query("SELECT * FROM review_history WHERE card_id = ?").all(cardId);
      expect(history).toHaveLength(1);
      expect((history[0] as any).quality).toBe(4);
    });

    test("rejects invalid quality (too low)", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId,
        quality: -1,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Quality must be between 0 and 5");
    });

    test("rejects invalid quality (too high)", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId,
        quality: 6,
      });

      expect(res.status).toBe(400);
    });

    test("rejects missing cardId", async () => {
      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        quality: 4,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("cardId and quality are required");
    });

    test("rejects missing quality", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId,
      });

      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent card", async () => {
      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId: 999,
        quality: 4,
      });

      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's card", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);
      const otherCardId = createTestCard(db, otherDeckId);

      const res = await authRequest(app, "POST", "/api/review/submit", token, {
        cardId: otherCardId,
        quality: 4,
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/review/history/:cardId", () => {
    test("returns review history for card", async () => {
      const cardId = createTestCard(db, deckId);

      // Submit multiple reviews
      await authRequest(app, "POST", "/api/review/submit", token, { cardId, quality: 3 });
      await authRequest(app, "POST", "/api/review/submit", token, { cardId, quality: 4 });
      await authRequest(app, "POST", "/api/review/submit", token, { cardId, quality: 5 });

      const res = await authRequest(app, "GET", `/api/review/history/${cardId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.history).toHaveLength(3);
      // Verify all qualities are recorded
      const qualities = data.history.map((h: any) => h.quality).sort();
      expect(qualities).toEqual([3, 4, 5]);
    });

    test("returns 404 for non-existent card", async () => {
      const res = await authRequest(app, "GET", "/api/review/history/999", token);
      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's card", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);
      const otherCardId = createTestCard(db, otherDeckId);

      const res = await authRequest(app, "GET", `/api/review/history/${otherCardId}`, token);
      expect(res.status).toBe(404);
    });
  });
});
