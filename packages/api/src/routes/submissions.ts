/**
 * Submissions Route
 *
 * Receives sanitized token usage data from the CLI.
 * Server-side validation rejects (not strips) payloads with extra fields.
 */

import { Hono } from "hono";
import { SubmissionPayloadSchema } from "@tokenboard/shared";
import { authMiddleware } from "../middleware/auth.js";
import { validateBody } from "../middleware/validation.js";
import type { Env } from "../types.js";

const submissions = new Hono<{ Bindings: Env }>();

submissions.post(
  "/",
  authMiddleware,
  validateBody(SubmissionPayloadSchema),
  async (c) => {
    const user = c.get("user");
    const payload = c.get("validatedBody") as import("@tokenboard/shared").SubmissionPayload;
    const now = Date.now();

    // Check idempotency
    const existing = await c.env.DB.prepare(
      "SELECT key FROM idempotency_keys WHERE key = ? AND user_id = ?"
    )
      .bind(payload.idempotency_key, user.id)
      .first();

    if (existing) {
      return c.json({ message: "Already submitted", deduplicated: true });
    }

    // Insert submissions in batches
    const batchSize = 100;
    for (let i = 0; i < payload.entries.length; i += batchSize) {
      const batch = payload.entries.slice(i, i + batchSize);
      const stmts = batch.map((entry) =>
        c.env.DB.prepare(
          `INSERT INTO submissions (id, user_id, agent, model, input_tokens, output_tokens,
           cache_creation_tokens, cache_read_tokens, reasoning_tokens,
           estimated_cost_usd, timestamp, client_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          user.id,
          entry.agent,
          entry.model,
          entry.input_tokens,
          entry.output_tokens,
          entry.cache_creation_tokens,
          entry.cache_read_tokens,
          entry.reasoning_tokens,
          entry.estimated_cost_usd,
          new Date(entry.timestamp).getTime(),
          payload.client_version,
          now
        )
      );

      await c.env.DB.batch(stmts);
    }

    // Record idempotency key
    await c.env.DB.prepare(
      "INSERT INTO idempotency_keys (key, user_id, created_at) VALUES (?, ?, ?)"
    )
      .bind(payload.idempotency_key, user.id, now)
      .run();

    // Update daily aggregates
    await updateAggregates(c.env.DB, user.id, payload);

    return c.json({
      message: "Submitted successfully",
      entries_count: payload.entries.length,
    });
  }
);

async function updateAggregates(
  db: D1Database,
  userId: string,
  payload: import("@tokenboard/shared").SubmissionPayload
) {
  // Group entries by date + agent
  const groups = new Map<
    string,
    {
      date: string;
      agent: string;
      input: number;
      output: number;
      cache: number;
      reasoning: number;
      cost: number;
    }
  >();

  for (const entry of payload.entries) {
    const date = entry.timestamp.split("T")[0]; // YYYY-MM-DD
    const key = `${date}:${entry.agent}`;
    const existing = groups.get(key) || {
      date,
      agent: entry.agent,
      input: 0,
      output: 0,
      cache: 0,
      reasoning: 0,
      cost: 0,
    };

    existing.input += entry.input_tokens;
    existing.output += entry.output_tokens;
    existing.cache += entry.cache_creation_tokens + entry.cache_read_tokens;
    existing.reasoning += entry.reasoning_tokens;
    existing.cost += entry.estimated_cost_usd;

    groups.set(key, existing);
  }

  // Upsert aggregates
  const stmts = Array.from(groups.values()).map((g) =>
    db
      .prepare(
        `INSERT INTO daily_aggregates
       (user_id, date, agent, total_input_tokens, total_output_tokens,
        total_cache_tokens, total_reasoning_tokens, total_cost_usd, total_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date, agent) DO UPDATE SET
         total_input_tokens = total_input_tokens + excluded.total_input_tokens,
         total_output_tokens = total_output_tokens + excluded.total_output_tokens,
         total_cache_tokens = total_cache_tokens + excluded.total_cache_tokens,
         total_reasoning_tokens = total_reasoning_tokens + excluded.total_reasoning_tokens,
         total_cost_usd = total_cost_usd + excluded.total_cost_usd,
         total_tokens = total_tokens + excluded.total_tokens`
      )
      .bind(
        userId,
        g.date,
        g.agent,
        g.input,
        g.output,
        g.cache,
        g.reasoning,
        g.cost,
        g.input + g.output + g.cache + g.reasoning
      )
  );

  if (stmts.length > 0) {
    await db.batch(stmts);
  }
}

export default submissions;
