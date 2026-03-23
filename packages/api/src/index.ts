/**
 * Tokenboard API
 *
 * Hono on Cloudflare Workers.
 * All routes enforce strict schema validation — extra fields are rejected.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types.js";
import auth from "./routes/auth.js";
import submissions from "./routes/submissions.js";
import leaderboard from "./routes/leaderboard.js";
import teams from "./routes/teams.js";
import users from "./routes/users.js";

const app = new Hono<{ Bindings: Env }>();

// CORS for dashboard
app.use(
  "/api/*",
  cors({
    origin: [
      "https://tokenboard.dev",
      "http://localhost:3000",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// Health check
app.get("/", (c) => c.json({ name: "tokenboard-api", version: "0.1.0" }));

// Mount routes
app.route("/api/v1/auth", auth);
app.route("/api/v1/submissions", submissions);
app.route("/api/v1/leaderboard", leaderboard);
app.route("/api/v1/teams", teams);
app.route("/api/v1/users", users);

// 404 handler
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
