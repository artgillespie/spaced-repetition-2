import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestApp } from "./app";
import {
  createTestDb,
  createTestUser,
  createTestSession,
  createTestDeck,
  createTestCard,
  authRequest,
} from "./setup";

describe("Cards API", () => {
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

  describe("GET /api/cards/deck/:deckId", () => {
    test("returns empty array when no cards exist", async () => {
      const res = await authRequest(app, "GET", `/api/cards/deck/${deckId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.cards).toEqual([]);
    });

    test("returns all cards in deck", async () => {
      createTestCard(db, deckId, "Front 1", "Back 1");
      createTestCard(db, deckId, "Front 2", "Back 2");

      const res = await authRequest(app, "GET", `/api/cards/deck/${deckId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.cards).toHaveLength(2);
    });

    test("returns 404 for non-existent deck", async () => {
      const res = await authRequest(app, "GET", "/api/cards/deck/999", token);
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("Deck not found");
    });

    test("returns 404 for another user's deck", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);

      const res = await authRequest(app, "GET", `/api/cards/deck/${otherDeckId}`, token);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/cards/deck/:deckId", () => {
    test("creates a new card", async () => {
      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}`, token, {
        front: "What is 2+2?",
        back: "4",
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.card.front).toBe("What is 2+2?");
      expect(data.card.back).toBe("4");
      expect(data.card.deck_id).toBe(deckId);
      expect(data.card.ease_factor).toBe(2.5);
      expect(data.card.interval).toBe(0);
      expect(data.card.repetitions).toBe(0);
    });

    test("trims whitespace from content", async () => {
      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}`, token, {
        front: "  Question  ",
        back: "  Answer  ",
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.card.front).toBe("Question");
      expect(data.card.back).toBe("Answer");
    });

    test("rejects card without front", async () => {
      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}`, token, {
        back: "Answer only",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Front and back content are required");
    });

    test("rejects card without back", async () => {
      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}`, token, {
        front: "Question only",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Front and back content are required");
    });

    test("rejects card with empty front", async () => {
      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}`, token, {
        front: "   ",
        back: "Answer",
      });

      expect(res.status).toBe(400);
    });

    test("returns 404 for non-existent deck", async () => {
      const res = await authRequest(app, "POST", "/api/cards/deck/999", token, {
        front: "Q",
        back: "A",
      });

      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's deck", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);

      const res = await authRequest(app, "POST", `/api/cards/deck/${otherDeckId}`, token, {
        front: "Q",
        back: "A",
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/cards/:id", () => {
    test("returns card by ID", async () => {
      const cardId = createTestCard(db, deckId, "Front", "Back");

      const res = await authRequest(app, "GET", `/api/cards/${cardId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.card.front).toBe("Front");
      expect(data.card.back).toBe("Back");
    });

    test("returns 404 for non-existent card", async () => {
      const res = await authRequest(app, "GET", "/api/cards/999", token);
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("Card not found");
    });

    test("returns 404 for another user's card", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);
      const otherCardId = createTestCard(db, otherDeckId);

      const res = await authRequest(app, "GET", `/api/cards/${otherCardId}`, token);
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/cards/:id", () => {
    test("updates card content", async () => {
      const cardId = createTestCard(db, deckId, "Old Front", "Old Back");

      const res = await authRequest(app, "PUT", `/api/cards/${cardId}`, token, {
        front: "New Front",
        back: "New Back",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.card.front).toBe("New Front");
      expect(data.card.back).toBe("New Back");
    });

    test("preserves SM-2 fields when updating content", async () => {
      const cardId = createTestCard(db, deckId);

      // Manually update SM-2 fields
      db.run(
        "UPDATE cards SET ease_factor = 2.8, interval = 10, repetitions = 5 WHERE id = ?",
        [cardId]
      );

      const res = await authRequest(app, "PUT", `/api/cards/${cardId}`, token, {
        front: "Updated Front",
        back: "Updated Back",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.card.ease_factor).toBe(2.8);
      expect(data.card.interval).toBe(10);
      expect(data.card.repetitions).toBe(5);
    });

    test("returns 404 for non-existent card", async () => {
      const res = await authRequest(app, "PUT", "/api/cards/999", token, {
        front: "New",
        back: "Content",
      });

      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's card", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);
      const otherCardId = createTestCard(db, otherDeckId);

      const res = await authRequest(app, "PUT", `/api/cards/${otherCardId}`, token, {
        front: "Hacked",
        back: "Content",
      });

      expect(res.status).toBe(404);
    });

    test("rejects empty front", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "PUT", `/api/cards/${cardId}`, token, {
        front: "   ",
        back: "Valid",
      });

      expect(res.status).toBe(400);
    });

    test("rejects empty back", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "PUT", `/api/cards/${cardId}`, token, {
        front: "Valid",
        back: "",
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/cards/:id", () => {
    test("deletes card", async () => {
      const cardId = createTestCard(db, deckId);

      const res = await authRequest(app, "DELETE", `/api/cards/${cardId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify card is deleted
      const getRes = await authRequest(app, "GET", `/api/cards/${cardId}`, token);
      expect(getRes.status).toBe(404);
    });

    test("returns 404 for non-existent card", async () => {
      const res = await authRequest(app, "DELETE", "/api/cards/999", token);
      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's card", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);
      const otherCardId = createTestCard(db, otherDeckId);

      const res = await authRequest(app, "DELETE", `/api/cards/${otherCardId}`, token);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/cards/deck/:deckId/import", () => {
    test("imports Q/A cards", async () => {
      const content = `Q: What is 2+2?
A: 4

Q: What is the capital of France?
A: Paris`;

      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}/import`, token, {
        content,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.imported).toBe(2);
      expect(data.cards).toHaveLength(2);
      expect(data.cards[0].front).toBe("What is 2+2?");
      expect(data.cards[0].back).toBe("4");
    });

    test("imports cloze cards", async () => {
      const content = `C: The [mitochondria] is the powerhouse of the cell.`;

      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}/import`, token, {
        content,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.imported).toBe(1);
      expect(data.cards[0].front).toBe("The [...] is the powerhouse of the cell.");
      expect(data.cards[0].back).toBe("The mitochondria is the powerhouse of the cell.");
    });

    test("returns parse errors for invalid cards while importing valid ones", async () => {
      const content = `Q: Valid question
A: Valid answer

Q: Missing answer

C: The [valid] cloze card.`;

      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}/import`, token, {
        content,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.imported).toBe(2);
      expect(data.parseErrors).toHaveLength(1);
      expect(data.parseErrors[0]).toContain("missing A:");
    });

    test("returns 400 when no valid cards found", async () => {
      const content = `This is just random text
without any valid cards`;

      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}/import`, token, {
        content,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("No valid cards found");
    });

    test("returns 400 for empty content", async () => {
      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}/import`, token, {
        content: "",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Content is required");
    });

    test("returns 404 for non-existent deck", async () => {
      const res = await authRequest(app, "POST", "/api/cards/deck/999/import", token, {
        content: "Q: Test\nA: Test",
      });

      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's deck", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);

      const res = await authRequest(app, "POST", `/api/cards/deck/${otherDeckId}/import`, token, {
        content: "Q: Test\nA: Test",
      });

      expect(res.status).toBe(404);
    });

    test("sets due_date on imported cards", async () => {
      const content = `Q: Question
A: Answer`;

      const res = await authRequest(app, "POST", `/api/cards/deck/${deckId}/import`, token, {
        content,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.cards[0].due_date).toBeDefined();
    });
  });
});
