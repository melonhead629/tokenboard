/**
 * Server-side schema validation middleware.
 *
 * SECURITY: Rejects (not strips) payloads with extra fields.
 * This is defense-in-depth — the CLI sanitizer should catch issues first,
 * but the API is the last line of defense.
 */

import type { Context, Next } from "hono";
import type { ZodSchema, ZodError } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    const body = await c.req.json().catch(() => null);
    if (body === null) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return c.json({ error: "Validation failed", details: errors }, 400);
    }

    c.set("validatedBody", result.data);
    await next();
  };
}
