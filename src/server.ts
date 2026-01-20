import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { config } from "./config";
import { auth } from "./routes/auth";
import { decks } from "./routes/decks";
import { cards } from "./routes/cards";
import { review } from "./routes/review";
import { cleanupExpiredSessions } from "./auth";

const app = new Hono();

// CORS for development
app.use("/api/*", cors());

// API routes
app.route("/api/auth", auth);
app.route("/api/decks", decks);
app.route("/api/cards", cards);
app.route("/api/review", review);

// Serve static files (CSS, JS, etc.)
app.use("/css/*", serveStatic({ root: "/home/sprite/spaced-repetition/public" }));
app.use("/js/*", serveStatic({ root: "/home/sprite/spaced-repetition/public" }));

// SPA fallback - serve index.html for all other routes
app.get("*", async (c) => {
  const html = await Bun.file("/home/sprite/spaced-repetition/public/index.html").text();
  return c.html(html);
});

// Cleanup expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

console.log(`Server running at http://localhost:${config.port}`);

export default {
  port: config.port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
