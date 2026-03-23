import { createMiddleware } from "hono/factory";
import * as jose from "jose";
import type { Env, AuthUser } from "../types.js";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid authorization header" }, 401);
    }

    const token = header.slice(7);

    try {
      const secret = new TextEncoder().encode(c.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret, {
        algorithms: ["HS256"],
      });

      const user: AuthUser = {
        id: payload.sub as string,
        github_id: payload.github_id as number,
        github_username: payload.github_username as string,
      };

      c.set("user", user);
      await next();
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  }
);
