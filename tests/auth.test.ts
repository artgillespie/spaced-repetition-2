import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestApp } from "./app";
import { createTestDb, createTestUser, createTestSession, request, authRequest } from "./setup";

describe("Auth API", () => {
  let db: Database;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    db = createTestDb();
    app = createTestApp(db);
  });

  describe("GET /api/auth/providers", () => {
    test("returns available auth providers", async () => {
      const res = await request(app, "GET", "/api/auth/providers");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.email).toBe(true);
      expect(data.github).toBe(false);
      expect(data.google).toBe(false);
    });
  });

  describe("POST /api/auth/signup", () => {
    test("creates a new user with valid credentials", async () => {
      const res = await request(app, "POST", "/api/auth/signup", {
        email: "newuser@example.com",
        password: "password123",
        name: "New User",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe("newuser@example.com");
      expect(data.user.name).toBe("New User");
    });

    test("rejects signup without email", async () => {
      const res = await request(app, "POST", "/api/auth/signup", {
        password: "password123",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Email and password are required");
    });

    test("rejects signup without password", async () => {
      const res = await request(app, "POST", "/api/auth/signup", {
        email: "test@example.com",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Email and password are required");
    });

    test("rejects signup with short password", async () => {
      const res = await request(app, "POST", "/api/auth/signup", {
        email: "test@example.com",
        password: "short",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Password must be at least 8 characters");
    });

    test("rejects signup with existing email", async () => {
      createTestUser(db, "existing@example.com");

      const res = await request(app, "POST", "/api/auth/signup", {
        email: "existing@example.com",
        password: "password123",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Email already registered");
    });
  });

  describe("POST /api/auth/signin", () => {
    test("signs in with valid credentials", async () => {
      // Create user via signup first
      await request(app, "POST", "/api/auth/signup", {
        email: "signin@example.com",
        password: "password123",
      });

      const res = await request(app, "POST", "/api/auth/signin", {
        email: "signin@example.com",
        password: "password123",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.user.email).toBe("signin@example.com");
    });

    test("rejects signin with wrong password", async () => {
      await request(app, "POST", "/api/auth/signup", {
        email: "wrong@example.com",
        password: "password123",
      });

      const res = await request(app, "POST", "/api/auth/signin", {
        email: "wrong@example.com",
        password: "wrongpassword",
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Invalid email or password");
    });

    test("rejects signin with non-existent email", async () => {
      const res = await request(app, "POST", "/api/auth/signin", {
        email: "nonexistent@example.com",
        password: "password123",
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Invalid email or password");
    });

    test("rejects signin without email", async () => {
      const res = await request(app, "POST", "/api/auth/signin", {
        password: "password123",
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Email and password are required");
    });
  });

  describe("GET /api/auth/me", () => {
    test("returns user info with valid token", async () => {
      const userId = createTestUser(db);
      const token = createTestSession(db, userId);

      const res = await authRequest(app, "GET", "/api/auth/me", token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe("test@example.com");
    });

    test("returns null user without token", async () => {
      const res = await request(app, "GET", "/api/auth/me");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.user).toBeNull();
    });

    test("returns null user with invalid token", async () => {
      const res = await authRequest(app, "GET", "/api/auth/me", "invalid_token");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.user).toBeNull();
    });
  });

  describe("POST /api/auth/logout", () => {
    test("logs out successfully", async () => {
      const userId = createTestUser(db);
      const token = createTestSession(db, userId);

      const res = await authRequest(app, "POST", "/api/auth/logout", token);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify session is deleted
      const meRes = await authRequest(app, "GET", "/api/auth/me", token);
      const meData = await meRes.json();
      expect(meData.user).toBeNull();
    });
  });
});
