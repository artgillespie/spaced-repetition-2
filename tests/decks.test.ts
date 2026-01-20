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
  request,
} from "./setup";

describe("Decks API", () => {
  let db: Database;
  let app: ReturnType<typeof createTestApp>;
  let userId: number;
  let token: string;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
    userId = createTestUser(db);
    token = createTestSession(db, userId);
  });

  describe("Authentication", () => {
    test("rejects requests without auth token", async () => {
      const res = await request(app, "GET", "/api/decks");
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    test("rejects requests with invalid token", async () => {
      const res = await authRequest(app, "GET", "/api/decks", "invalid_token");
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("GET /api/decks", () => {
    test("returns empty array when no decks exist", async () => {
      const res = await authRequest(app, "GET", "/api/decks", token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.decks).toEqual([]);
    });

    test("returns user's decks with card counts", async () => {
      const deckId = createTestDeck(db, userId, "My Deck", "Description");
      createTestCard(db, deckId, "Front 1", "Back 1");
      createTestCard(db, deckId, "Front 2", "Back 2");

      const res = await authRequest(app, "GET", "/api/decks", token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.decks).toHaveLength(1);
      expect(data.decks[0].name).toBe("My Deck");
      expect(data.decks[0].description).toBe("Description");
      expect(data.decks[0].card_count).toBe(2);
    });

    test("does not return other users' decks", async () => {
      // Create another user's deck
      const otherUserId = createTestUser(db, "other@example.com");
      createTestDeck(db, otherUserId, "Other User's Deck");

      // Create our deck
      createTestDeck(db, userId, "My Deck");

      const res = await authRequest(app, "GET", "/api/decks", token);
      const data = await res.json();

      expect(data.decks).toHaveLength(1);
      expect(data.decks[0].name).toBe("My Deck");
    });
  });

  describe("POST /api/decks", () => {
    test("creates a new deck", async () => {
      const res = await authRequest(app, "POST", "/api/decks", token, {
        name: "New Deck",
        description: "New Description",
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.deck.name).toBe("New Deck");
      expect(data.deck.description).toBe("New Description");
      expect(data.deck.id).toBeDefined();
    });

    test("creates deck without description", async () => {
      const res = await authRequest(app, "POST", "/api/decks", token, {
        name: "No Description Deck",
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.deck.name).toBe("No Description Deck");
      expect(data.deck.description).toBeNull();
    });

    test("trims whitespace from name and description", async () => {
      const res = await authRequest(app, "POST", "/api/decks", token, {
        name: "  Trimmed Name  ",
        description: "  Trimmed Description  ",
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.deck.name).toBe("Trimmed Name");
      expect(data.deck.description).toBe("Trimmed Description");
    });

    test("rejects deck without name", async () => {
      const res = await authRequest(app, "POST", "/api/decks", token, {
        description: "Just a description",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Deck name is required");
    });

    test("rejects deck with empty name", async () => {
      const res = await authRequest(app, "POST", "/api/decks", token, {
        name: "   ",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Deck name is required");
    });
  });

  describe("GET /api/decks/:id", () => {
    test("returns deck with card counts", async () => {
      const deckId = createTestDeck(db, userId, "Test Deck");
      createTestCard(db, deckId);

      const res = await authRequest(app, "GET", `/api/decks/${deckId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deck.name).toBe("Test Deck");
      expect(data.deck.card_count).toBe(1);
    });

    test("returns 404 for non-existent deck", async () => {
      const res = await authRequest(app, "GET", "/api/decks/999", token);
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("Deck not found");
    });

    test("returns 404 for another user's deck", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId, "Other Deck");

      const res = await authRequest(app, "GET", `/api/decks/${otherDeckId}`, token);
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/decks/:id", () => {
    test("updates deck name and description", async () => {
      const deckId = createTestDeck(db, userId, "Old Name", "Old Description");

      const res = await authRequest(app, "PUT", `/api/decks/${deckId}`, token, {
        name: "New Name",
        description: "New Description",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deck.name).toBe("New Name");
      expect(data.deck.description).toBe("New Description");
    });

    test("clears description when empty", async () => {
      const deckId = createTestDeck(db, userId, "Test", "Old Description");

      const res = await authRequest(app, "PUT", `/api/decks/${deckId}`, token, {
        name: "Test",
        description: "",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deck.description).toBeNull();
    });

    test("returns 404 for non-existent deck", async () => {
      const res = await authRequest(app, "PUT", "/api/decks/999", token, {
        name: "New Name",
      });

      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's deck", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);

      const res = await authRequest(app, "PUT", `/api/decks/${otherDeckId}`, token, {
        name: "Hacked",
      });

      expect(res.status).toBe(404);
    });

    test("rejects empty name", async () => {
      const deckId = createTestDeck(db, userId);

      const res = await authRequest(app, "PUT", `/api/decks/${deckId}`, token, {
        name: "   ",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Deck name is required");
    });
  });

  describe("DELETE /api/decks/:id", () => {
    test("deletes deck", async () => {
      const deckId = createTestDeck(db, userId);

      const res = await authRequest(app, "DELETE", `/api/decks/${deckId}`, token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify deck is deleted
      const getRes = await authRequest(app, "GET", `/api/decks/${deckId}`, token);
      expect(getRes.status).toBe(404);
    });

    test("deletes deck's cards via cascade", async () => {
      const deckId = createTestDeck(db, userId);
      const cardId = createTestCard(db, deckId);

      await authRequest(app, "DELETE", `/api/decks/${deckId}`, token);

      // Verify card is deleted
      const card = db.query("SELECT * FROM cards WHERE id = ?").get(cardId);
      expect(card).toBeNull();
    });

    test("returns 404 for non-existent deck", async () => {
      const res = await authRequest(app, "DELETE", "/api/decks/999", token);
      expect(res.status).toBe(404);
    });

    test("returns 404 for another user's deck", async () => {
      const otherUserId = createTestUser(db, "other@example.com");
      const otherDeckId = createTestDeck(db, otherUserId);

      const res = await authRequest(app, "DELETE", `/api/decks/${otherDeckId}`, token);
      expect(res.status).toBe(404);
    });
  });
});
