/**
 * Teams Routes
 *
 * Team creation, invite code management, join/leave.
 * Team data is fully isolated — non-members cannot query team leaderboards.
 */

import { Hono } from "hono";
import { CreateTeamSchema, JoinTeamSchema } from "@tokenboard/shared";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import type { Env } from "../types.js";

const teams = new Hono<{ Bindings: Env }>();

// Generate a random 8-char alphanumeric invite code
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of bytes) {
    code += chars[byte % chars.length];
  }
  return code;
}

// Create team
teams.post("/", authMiddleware, validateBody(CreateTeamSchema), async (c) => {
  const user = c.get("user");
  const body = c.get("validatedBody") as import("@tokenboard/shared").CreateTeam;
  const now = Date.now();
  const teamId = crypto.randomUUID();
  const inviteCode = generateInviteCode();

  // Check slug uniqueness
  const existing = await c.env.DB.prepare(
    "SELECT 1 FROM teams WHERE slug = ?"
  )
    .bind(body.slug)
    .first();

  if (existing) {
    return c.json({ error: "Team slug already taken" }, 409);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO teams (id, slug, name, invite_code, created_by, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      teamId,
      body.slug,
      body.name,
      inviteCode,
      user.id,
      body.is_public ? 1 : 0,
      now,
      now
    ),
    // Creator auto-joins as admin
    c.env.DB.prepare(
      "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)"
    ).bind(teamId, user.id, now),
  ]);

  return c.json({ slug: body.slug, invite_code: inviteCode }, 201);
});

// Join team with invite code
teams.post("/:slug/join", authMiddleware, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ invite_code: string }>();

  const parsed = JoinTeamSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid invite code format" }, 400);
  }

  // Find team by invite code (ignore slug — let the code be the authority)
  const team = await c.env.DB.prepare(
    "SELECT id, slug, name FROM teams WHERE invite_code = ?"
  )
    .bind(parsed.data.invite_code)
    .first<{ id: string; slug: string; name: string }>();

  if (!team) {
    return c.json({ error: "Invalid invite code" }, 404);
  }

  // Check if already a member
  const existing = await c.env.DB.prepare(
    "SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?"
  )
    .bind(team.id, user.id)
    .first();

  if (existing) {
    return c.json({ message: "Already a member", team: team.slug });
  }

  await c.env.DB.prepare(
    "INSERT INTO team_members (team_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)"
  )
    .bind(team.id, user.id, Date.now())
    .run();

  return c.json({ message: "Joined team", team: team.slug, name: team.name });
});

// Leave team
teams.delete("/:slug/leave", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");

  const team = await c.env.DB.prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) {
    return c.json({ error: "Team not found" }, 404);
  }

  await c.env.DB.prepare(
    "DELETE FROM team_members WHERE team_id = ? AND user_id = ?"
  )
    .bind(team.id, user.id)
    .run();

  return c.json({ message: "Left team" });
});

// Regenerate invite code (admin only)
teams.post("/:slug/invite", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");

  const team = await c.env.DB.prepare("SELECT id FROM teams WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();

  if (!team) {
    return c.json({ error: "Team not found" }, 404);
  }

  // Check admin role
  const membership = await c.env.DB.prepare(
    "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?"
  )
    .bind(team.id, user.id)
    .first<{ role: string }>();

  if (membership?.role !== "admin") {
    return c.json({ error: "Only team admins can regenerate invite codes" }, 403);
  }

  const newCode = generateInviteCode();
  await c.env.DB.prepare(
    "UPDATE teams SET invite_code = ?, updated_at = ? WHERE id = ?"
  )
    .bind(newCode, Date.now(), team.id)
    .run();

  return c.json({ invite_code: newCode });
});

// Get team info (members only)
teams.get("/:slug", authMiddleware, async (c) => {
  const slug = c.req.param("slug");
  const user = c.get("user");

  const team = await c.env.DB.prepare(
    "SELECT id, slug, name, is_public, created_at FROM teams WHERE slug = ?"
  )
    .bind(slug)
    .first<{
      id: string;
      slug: string;
      name: string;
      is_public: number;
      created_at: number;
    }>();

  if (!team) {
    return c.json({ error: "Team not found" }, 404);
  }

  // Verify membership
  const membership = await c.env.DB.prepare(
    "SELECT role FROM team_members WHERE team_id = ? AND user_id = ?"
  )
    .bind(team.id, user.id)
    .first<{ role: string }>();

  if (!membership && !team.is_public) {
    return c.json({ error: "Not a member of this team" }, 403);
  }

  // Get member count
  const memberCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM team_members WHERE team_id = ?"
  )
    .bind(team.id)
    .first<{ count: number }>();

  return c.json({
    slug: team.slug,
    name: team.name,
    is_public: !!team.is_public,
    member_count: memberCount?.count || 0,
    your_role: membership?.role || null,
    created_at: new Date(team.created_at).toISOString(),
  });
});

export default teams;
