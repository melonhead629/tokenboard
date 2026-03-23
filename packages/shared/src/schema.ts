/**
 * THE SECURITY CONTRACT
 *
 * This file defines the COMPLETE and EXHAUSTIVE list of fields that can leave
 * a user's machine. Adding a field here requires a security review.
 *
 * NEVER TRANSMITTED:
 * - Code, diffs, snippets
 * - Prompts, questions, instructions
 * - File paths, project names, directory names
 * - Repo URLs, branch names, commit hashes
 * - Conversation content or assistant responses
 * - Tool calls or tool results
 * - Session IDs, working directories
 * - Any free-text field beyond agent/model identifiers
 */

import { z } from "zod";

export const SUPPORTED_AGENTS = [
  "claude-code",
  "codex",
  "cursor",
  "gemini-cli",
  "opencode",
  "amp",
  "roo-code",
  "kilo",
  "copilot",
  "other",
] as const;

export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

export const SubmissionEntrySchema = z
  .object({
    // When this usage occurred (rounded to nearest hour for privacy)
    timestamp: z.string().datetime(),

    // Which AI coding agent generated this usage
    agent: z.enum(SUPPORTED_AGENTS),

    // Which model was used (e.g., "claude-opus-4-6", "gpt-4o")
    // Validated against known patterns, max 100 chars
    model: z.string().max(100),

    // Token counts — the core metrics
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_creation_tokens: z.number().int().nonnegative().default(0),
    cache_read_tokens: z.number().int().nonnegative().default(0),
    reasoning_tokens: z.number().int().nonnegative().default(0),

    // Estimated cost in USD (calculated client-side from pricing table)
    estimated_cost_usd: z.number().nonnegative(),
  })
  .strict(); // .strict() rejects any extra fields

export const SubmissionPayloadSchema = z
  .object({
    entries: z.array(SubmissionEntrySchema).min(1).max(10000),
    client_version: z.string().max(20),
    idempotency_key: z.string().max(64),
  })
  .strict();

export type SubmissionEntry = z.infer<typeof SubmissionEntrySchema>;
export type SubmissionPayload = z.infer<typeof SubmissionPayloadSchema>;

// Leaderboard query params
export const LeaderboardQuerySchema = z.object({
  period: z.enum(["today", "week", "month", "all"]).default("week"),
  metric: z
    .enum(["tokens", "cost", "streak", "tokens_per_day"])
    .default("tokens"),
  agent: z
    .enum([...SUPPORTED_AGENTS, "all"] as [string, ...string[]])
    .default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

// Team creation
export const CreateTeamSchema = z
  .object({
    name: z.string().min(2).max(50),
    slug: z
      .string()
      .min(2)
      .max(30)
      .regex(/^[a-z0-9-]+$/),
    is_public: z.boolean().default(false),
  })
  .strict();

export type CreateTeam = z.infer<typeof CreateTeamSchema>;

// Join team
export const JoinTeamSchema = z
  .object({
    invite_code: z
      .string()
      .length(8)
      .regex(/^[A-Z0-9]+$/),
  })
  .strict();

export type JoinTeam = z.infer<typeof JoinTeamSchema>;
