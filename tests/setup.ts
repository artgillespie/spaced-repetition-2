import { Database } from "bun:sqlite";
import { initializeDatabase } from "../src/db/schema";

// Create a fresh in-memory database for each test
export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  initializeDatabase(db);
  return db;
}

// Test user helper
export function createTestUser(db: Database, email = "test@example.com", passwordHash = "hashed_password", name = "Test User") {
  const result = db.run(
    "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
    [email, passwordHash, name]
  );
  return Number(result.lastInsertRowid);
}

// Test session helper
export function createTestSession(db: Database, userId: number, token = "test_token_123") {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  db.run(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt.toISOString()]
  );
  return token;
}

// Test deck helper
export function createTestDeck(db: Database, userId: number, name = "Test Deck", description = "Test Description") {
  const result = db.run(
    "INSERT INTO decks (user_id, name, description) VALUES (?, ?, ?)",
    [userId, name, description]
  );
  return Number(result.lastInsertRowid);
}

// Test card helper
export function createTestCard(db: Database, deckId: number, front = "Front", back = "Back") {
  const result = db.run(
    "INSERT INTO cards (deck_id, front, back, due_date) VALUES (?, ?, ?, datetime('now'))",
    [deckId, front, back]
  );
  return Number(result.lastInsertRowid);
}

// Helper to make authenticated API requests
export async function authRequest(
  app: { fetch: (req: Request) => Promise<Response> },
  method: string,
  path: string,
  token: string,
  body?: object
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return app.fetch(req);
}

// Helper to make unauthenticated API requests
export async function request(
  app: { fetch: (req: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: object
) {
  const headers: Record<string, string> = {};

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return app.fetch(req);
}
