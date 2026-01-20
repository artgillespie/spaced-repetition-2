import { db } from "./db";

// Generate a random token
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Hash password using Bun's built-in password hashing
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// Session management
const SESSION_DURATION_DAYS = 30;

export function createSession(userId: number): string {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  db.run(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt.toISOString()]
  );

  return token;
}

export function getSessionUser(token: string): { id: number; email: string; name: string | null; avatar_url: string | null } | null {
  const row = db.query(`
    SELECT u.id, u.email, u.name, u.avatar_url
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as { id: number; email: string; name: string | null; avatar_url: string | null } | null;

  return row;
}

export function deleteSession(token: string): void {
  db.run("DELETE FROM sessions WHERE token = ?", [token]);
}

// Clean up expired sessions periodically
export function cleanupExpiredSessions(): void {
  db.run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
}

// User management
export function createUser(email: string, passwordHash: string | null, name: string | null = null, avatarUrl: string | null = null): number {
  const result = db.run(
    "INSERT INTO users (email, password_hash, name, avatar_url) VALUES (?, ?, ?, ?)",
    [email, passwordHash, name, avatarUrl]
  );
  return Number(result.lastInsertRowid);
}

export function updateUserAvatar(userId: number, avatarUrl: string): void {
  db.run("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, userId]);
}

export function getUserByEmail(email: string): { id: number; email: string; password_hash: string | null; name: string | null } | null {
  return db.query("SELECT id, email, password_hash, name FROM users WHERE email = ?").get(email) as any;
}

export function getUserById(id: number): { id: number; email: string; name: string | null } | null {
  return db.query("SELECT id, email, name FROM users WHERE id = ?").get(id) as any;
}

// OAuth account linking
export function linkOAuthAccount(userId: number, provider: string, providerId: string): void {
  db.run(
    "INSERT OR IGNORE INTO oauth_accounts (user_id, provider, provider_id) VALUES (?, ?, ?)",
    [userId, provider, providerId]
  );
}

export function getUserByOAuth(provider: string, providerId: string): { id: number; email: string; name: string | null; avatar_url: string | null } | null {
  return db.query(`
    SELECT u.id, u.email, u.name, u.avatar_url
    FROM oauth_accounts o
    JOIN users u ON o.user_id = u.id
    WHERE o.provider = ? AND o.provider_id = ?
  `).get(provider, providerId) as any;
}
