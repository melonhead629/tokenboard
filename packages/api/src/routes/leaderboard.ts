/**
 * Leaderboard Routes
 *
 * Returns ranked user data based on aggregated token usage.
 * Team leaderboards enforce membership checks.
 */

import { Hono } from "hono";
import { LeaderboardQuerySchema } from "@tokenboard/shared";
import { authMiddleware } from "../middleware/auth.js";
import type { Env } from "../types.js";

const leaderboard = new Hono<{ Bindings: Env }>();

// Global leaderboard (public, opt-in users only)
leaderboard.get("/global", async (c) => {
  const rawQuery = {
    period: c.req.query("period") || "week",
    metric: c.req.query("metric") || "tokens",
    agent: c.req.query("agent") || "all",
    limit: c.req.query("limit") || "50",
    offset: c.req.query("offset") || "0",
  };

  const query = LeaderboardQuerySchema.safeParse(rawQuery);
  if (!query.success) {
    return c.json({ error: "Invalid query parameters" }, 400);
  }

  const { period, metric, agent, limit, offset } = query.data;
  const dateFilter = getDateFilter(period);

  let agentFilter = "";
  const binds: (string | number)[] = [];

  if (dateFilter) {
    binds.push(dateFilter);
  }

  if (agent !== "all") {
    agentFilter = dateFilter
      ? " AND da.agent = ?"
      : " WHERE da.agent = ?";
    binds.push(agent);
  }

  const orderBy = metric === "cost" ? "total_cost" : "total_tokens";

  const sql = `
    SELECT
      u.github_username as username,
      u.avatar_url,
      SUM(da.total_tokens) as total_tokens,
      SUM(da.total_cost_usd) as total_cost,
      COUNT(DISTINCT da.date) as active_days,
      GROUP_CONCAT(DISTINCT da.agent) as agents
    FROM daily_aggregates da
    JOIN users u ON u.id = da.user_id
    WHERE u.is_public = 1
    ${dateFilter ? " AND da.date >= ?" : ""}
    ${agent !== "all" ? " AND da.agent = ?" : ""}
    GROUP BY da.user_id
    ORDER BY ${orderBy} DESC
    LIMIT ? OFFSET ?
  `;

  binds.push(limit, offset);

  const results = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<{
      username: string;
      avatar_url: string;
      total_tokens: number;
      total_cost: number;
      active_days: number;
      agents: string;
    }>();

  const entries = (results.results || []).map((row, i) => ({
    rank: offset + i + 1,
    username: row.username,
    avatar_url: row.avatar_url || "",
    total_tokens: row.total_tokens,
    total_cost: Math.round(row.total_cost * 100) / 100,
    streak: row.active_days, // Simplified — real streak needs consecutive day calc
    top_agent: row.agents?.split(",")[0] || "unknown",
  }));

  return c.json({ entries, total: entries.length });
});

// Team leaderboard (members only)
leaderboard.get("/team/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");

  // Verify team exists
  const team = await c.env.DB.prepare("SELECT id, is_public FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string; is_public: number }>();

  if (!team) {
    return c.json({ error: "Team not found" }, 404);
  }

  // Verify membership (unless team is public)
  if (!team.is_public) {
    const membership = await c.env.DB.prepare(
      "SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?"
    )
      .bind(team.id, user.id)
      .first();

    if (!membership) {
      return c.json({ error: "Not a member of this team" }, 403);
    }
  }

  // Query params
  const rawQuery = {
    period: c.req.query("period") || "week",
    metric: c.req.query("metric") || "tokens",
    agent: c.req.query("agent") || "all",
    limit: c.req.query("limit") || "50",
    offset: c.req.query("offset") || "0",
  };

  const query = LeaderboardQuerySchema.safeParse(rawQuery);
  if (!query.success) {
    return c.json({ error: "Invalid query parameters" }, 400);
  }

  const { period, metric, agent, limit, offset } = query.data;
  const dateFilter = getDateFilter(period);
  const orderBy = metric === "cost" ? "total_cost" : "total_tokens";

  const binds: (string | number)[] = [team.id];
  if (dateFilter) binds.push(dateFilter);
  if (agent !== "all") binds.push(agent);
  binds.push(limit, offset);

  const sql = `
    SELECT
      u.github_username as username,
      u.avatar_url,
      SUM(da.total_tokens) as total_tokens,
      SUM(da.total_cost_usd) as total_cost,
      COUNT(DISTINCT da.date) as active_days,
      GROUP_CONCAT(DISTINCT da.agent) as agents
    FROM daily_aggregates da
    JOIN users u ON u.id = da.user_id
    JOIN team_members tm ON tm.user_id = da.user_id
    WHERE tm.team_id = ?
    ${dateFilter ? " AND da.date >= ?" : ""}
    ${agent !== "all" ? " AND da.agent = ?" : ""}
    GROUP BY da.user_id
    ORDER BY ${orderBy} DESC
    LIMIT ? OFFSET ?
  `;

  const results = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<{
      username: string;
      avatar_url: string;
      total_tokens: number;
      total_cost: number;
      active_days: number;
      agents: string;
    }>();

  const entries = (results.results || []).map((row, i) => ({
    rank: offset + i + 1,
    username: row.username,
    avatar_url: row.avatar_url || "",
    total_tokens: row.total_tokens,
    total_cost: Math.round(row.total_cost * 100) / 100,
    streak: row.active_days,
    top_agent: row.agents?.split(",")[0] || "unknown",
  }));

  return c.json({ entries, total: entries.length });
});

function getDateFilter(period: string): string | null {
  const now = new Date();
  switch (period) {
    case "today":
      return now.toISOString().split("T")[0];
    case "week": {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return weekAgo.toISOString().split("T")[0];
    }
    case "month": {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return monthAgo.toISOString().split("T")[0];
    }
    default:
      return null; // "all"
  }
}

export default leaderboard;
