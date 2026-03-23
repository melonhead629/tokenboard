/**
 * Users Routes
 *
 * Profile management, audit trail, and GDPR data deletion.
 */

import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import type { Env } from "../types.js";

const users = new Hono<{ Bindings: Env }>();

// Get current user profile
users.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");

  const profile = await c.env.DB.prepare(
    "SELECT github_username, display_name, avatar_url, is_public, created_at FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first<{
      github_username: string;
      display_name: string | null;
      avatar_url: string | null;
      is_public: number;
      created_at: number;
    }>();

  if (!profile) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get team memberships
  const teams = await c.env.DB.prepare(
    `SELECT t.slug, t.name, tm.role
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = ?`
  )
    .bind(user.id)
    .all<{ slug: string; name: string; role: string }>();

  return c.json({
    username: profile.github_username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    is_public: !!profile.is_public,
    teams: teams.results || [],
    created_at: new Date(profile.created_at).toISOString(),
  });
});

// Update profile
users.patch("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    display_name?: string;
    is_public?: boolean;
  }>();

  const updates: string[] = [];
  const binds: (string | number)[] = [];

  if (body.display_name !== undefined) {
    updates.push("display_name = ?");
    binds.push(body.display_name.slice(0, 50));
  }

  if (body.is_public !== undefined) {
    updates.push("is_public = ?");
    binds.push(body.is_public ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  updates.push("updated_at = ?");
  binds.push(Date.now());
  binds.push(user.id);

  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(", ")} WHERE id = ?`
  )
    .bind(...binds)
    .run();

  return c.json({ message: "Updated" });
});

// Audit trail: view all submitted data
users.get("/me/submissions", authMiddleware, async (c) => {
  const user = c.get("user");
  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 1000);
  const offset = parseInt(c.req.query("offset") || "0");

  const results = await c.env.DB.prepare(
    `SELECT agent, model, input_tokens, output_tokens,
            cache_creation_tokens, cache_read_tokens, reasoning_tokens,
            estimated_cost_usd, timestamp, client_version, created_at
     FROM submissions
     WHERE user_id = ?
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`
  )
    .bind(user.id, limit, offset)
    .all();

  return c.json({
    submissions: results.results || [],
    limit,
    offset,
  });
});

// GDPR: Delete ALL user data
users.delete("/me", authMiddleware, async (c) => {
  const user = c.get("user");

  // CASCADE deletes handle: submissions, daily_aggregates, team_members,
  // sessions, idempotency_keys
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?")
    .bind(user.id)
    .run();

  return c.json({ message: "All data deleted" });
});

// Public profile
users.get("/:username", async (c) => {
  const username = c.req.param("username");

  const profile = await c.env.DB.prepare(
    "SELECT github_username, avatar_url, is_public, created_at FROM users WHERE github_username = ? AND is_public = 1"
  )
    .bind(username)
    .first<{
      github_username: string;
      avatar_url: string | null;
      is_public: number;
      created_at: number;
    }>();

  if (!profile) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get aggregate stats
  const stats = await c.env.DB.prepare(
    `SELECT
       SUM(total_tokens) as total_tokens,
       SUM(total_cost_usd) as total_cost,
       COUNT(DISTINCT date) as active_days
     FROM daily_aggregates da
     JOIN users u ON u.id = da.user_id
     WHERE u.github_username = ?`
  )
    .bind(username)
    .first<{
      total_tokens: number;
      total_cost: number;
      active_days: number;
    }>();

  // Agent breakdown
  const agents = await c.env.DB.prepare(
    `SELECT agent, SUM(total_tokens) as tokens
     FROM daily_aggregates da
     JOIN users u ON u.id = da.user_id
     WHERE u.github_username = ?
     GROUP BY agent
     ORDER BY tokens DESC`
  )
    .bind(username)
    .all<{ agent: string; tokens: number }>();

  return c.json({
    username: profile.github_username,
    avatar_url: profile.avatar_url,
    total_tokens: stats?.total_tokens || 0,
    total_cost: stats?.total_cost || 0,
    active_days: stats?.active_days || 0,
    agents: agents.results || [],
    created_at: new Date(profile.created_at).toISOString(),
  });
});

export default users;
