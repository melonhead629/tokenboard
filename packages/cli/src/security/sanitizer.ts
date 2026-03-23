/**
 * Sanitizer — The Primary Security Control
 *
 * Sits between parsers and the API client. Enforces:
 * 1. Allowlist: Only fields in SubmissionEntrySchema pass through
 * 2. Timestamp rounding: All timestamps rounded to nearest hour
 * 3. Model validation: Model names validated and truncated
 * 4. Size limits: No oversized payloads
 *
 * This module is the last client-side defense before data leaves the machine.
 */

import {
  SubmissionEntrySchema,
  type SubmissionEntry,
  type SubmissionPayload,
} from "@tokenboard/shared";
import { estimateCost } from "@tokenboard/shared";
import type { RawParsedEntry } from "../parsers/types.js";
import { createHash } from "crypto";

const MAX_ENTRIES_PER_SUBMISSION = 10000;
const MAX_MODEL_LENGTH = 100;

/**
 * Round a Date to the nearest hour.
 * This prevents timing correlation attacks (e.g., "User X coded at 2:37 AM
 * right after the board meeting about Project Y").
 */
function roundToHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setMinutes(0, 0, 0);
  return rounded;
}

/**
 * Validate and sanitize model name.
 * Only alphanumeric, hyphens, dots, and underscores allowed.
 */
function sanitizeModel(model: string): string {
  const cleaned = model.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, MAX_MODEL_LENGTH);
  return cleaned || "unknown";
}

/**
 * Convert raw parsed entries into a submission-safe payload.
 * This is the ONLY path from parsed data to the API.
 */
export function sanitize(
  entries: RawParsedEntry[],
  clientVersion: string
): SubmissionPayload {
  const sanitizedEntries: SubmissionEntry[] = [];

  for (const raw of entries.slice(0, MAX_ENTRIES_PER_SUBMISSION)) {
    const roundedTimestamp = roundToHour(raw.timestamp);
    const model = sanitizeModel(raw.model);

    const entry: SubmissionEntry = {
      timestamp: roundedTimestamp.toISOString(),
      agent: raw.agent,
      model,
      input_tokens: Math.max(0, Math.floor(raw.input_tokens)),
      output_tokens: Math.max(0, Math.floor(raw.output_tokens)),
      cache_creation_tokens: Math.max(0, Math.floor(raw.cache_creation_tokens)),
      cache_read_tokens: Math.max(0, Math.floor(raw.cache_read_tokens)),
      reasoning_tokens: Math.max(0, Math.floor(raw.reasoning_tokens)),
      estimated_cost_usd: estimateCost(model, {
        input_tokens: raw.input_tokens,
        output_tokens: raw.output_tokens,
        cache_creation_tokens: raw.cache_creation_tokens,
        cache_read_tokens: raw.cache_read_tokens,
      }),
    };

    // Final validation against the schema — belt AND suspenders
    const result = SubmissionEntrySchema.safeParse(entry);
    if (result.success) {
      sanitizedEntries.push(result.data);
    }
    // If validation fails, silently drop the entry (never transmit invalid data)
  }

  // Generate idempotency key from entry content (deterministic)
  const contentHash = createHash("sha256")
    .update(JSON.stringify(sanitizedEntries))
    .digest("hex")
    .slice(0, 64);

  return {
    entries: sanitizedEntries,
    client_version: clientVersion,
    idempotency_key: contentHash,
  };
}
