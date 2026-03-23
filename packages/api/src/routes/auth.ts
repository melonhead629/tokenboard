/**
 * GitHub OAuth Routes
 *
 * Uses the OAuth Device Flow (no redirect URI, works in terminals):
 * 1. CLI calls POST /auth/github → gets device_code + user_code
 * 2. User visits github.com/login/device and enters code
 * 3. CLI polls POST /auth/github/callback → gets JWT
 */

import { Hono } from "hono";
import * as jose from "jose";
import type { Env } from "../types.js";

const auth = new Hono<{ Bindings: Env }>();

// Step 1: Initiate device flow
auth.post("/github", async (c) => {
  const response = await fetch(
    "https://github.com/login/device/code",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        scope: "read:user",
      }),
    }
  );

  const data = (await response.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  return c.json({
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in,
    interval: data.interval,
  });
});

// Step 2: Complete OAuth (CLI polls this)
auth.post("/github/callback", async (c) => {
  const body = await c.req.json<{ device_code: string }>();

  // Exchange device code for access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        device_code: body.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    }
  );

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error) {
    return c.json(
      { error: tokenData.error, message: tokenData.error_description },
      tokenData.error === "authorization_pending" ? 202 : 400
    );
  }

  if (!tokenData.access_token) {
    return c.json({ error: "No access token received" }, 400);
  }

  // Get GitHub user info
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  const githubUser = (await userResponse.json()) as {
    id: number;
    login: string;
    avatar_url: string;
  };

  // Upsert user in database
  const now = Date.now();
  const userId = crypto.randomUUID();

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE github_id = ?"
  )
    .bind(githubUser.id)
    .first<{ id: string }>();

  const finalUserId = existing?.id || userId;

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE users SET github_username = ?, avatar_url = ?, updated_at = ? WHERE id = ?"
    )
      .bind(githubUser.login, githubUser.avatar_url, now, existing.id)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (id, github_id, github_username, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(userId, githubUser.id, githubUser.login, githubUser.avatar_url, now, now)
      .run();
  }

  // Generate JWT
  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const jwt = await new jose.SignJWT({
    sub: finalUserId,
    github_id: githubUser.id,
    github_username: githubUser.login,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  return c.json({
    token: jwt,
    github_username: githubUser.login,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
});

export default auth;
