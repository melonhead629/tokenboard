/**
 * Codex (OpenAI) Parser
 *
 * Reads from ~/.codex/logs_1.sqlite
 * Uses the threads table for aggregate token counts per session.
 *
 * SECURITY: Never reads cwd, first_user_message, title, git_sha,
 * git_branch, git_origin_url, or any content fields.
 */

import { stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import Database from "better-sqlite3";
import type { Parser, ParseOptions, RawParsedEntry } from "./types.js";

const CODEX_DB_PATH = join(homedir(), ".codex", "state_5.sqlite");

export const codexParser: Parser = {
  name: "codex",

  async isAvailable(): Promise<boolean> {
    try {
      await stat(CODEX_DB_PATH);
      return true;
    } catch {
      return false;
    }
  },

  async parse(options: ParseOptions): Promise<RawParsedEntry[]> {
    const entries: RawParsedEntry[] = [];
    const db = new Database(CODEX_DB_PATH, { readonly: true });

    try {
      // SECURITY: Only SELECT model, model_provider, tokens_used, created_at
      // Never select: cwd, first_user_message, title, git_*, rollout_path
      let query = `
        SELECT model, model_provider, tokens_used, created_at
        FROM threads
        WHERE tokens_used > 0
      `;

      const params: (string | number)[] = [];

      if (options.since) {
        query += ` AND created_at >= ?`;
        params.push(Math.floor(options.since.getTime() / 1000));
      }
      if (options.until) {
        query += ` AND created_at <= ?`;
        params.push(Math.floor(options.until.getTime() / 1000));
      }

      const rows = db.prepare(query).all(...params) as Array<{
        model: string | null;
        model_provider: string | null;
        tokens_used: number;
        created_at: number;
      }>;

      for (const row of rows) {
        // created_at is unix seconds
        const timestamp = new Date(row.created_at * 1000);
        if (isNaN(timestamp.getTime())) continue;

        // Codex often leaves model blank but has model_provider
        let model = row.model || "unknown";
        if (model === "unknown" && row.model_provider === "openai") {
          model = "codex"; // Map to codex pricing
        }

        entries.push({
          timestamp,
          agent: "codex",
          model,
          // Codex only gives aggregate tokens_used, no input/output split
          // We attribute all to output as a conservative cost estimate
          input_tokens: 0,
          output_tokens: row.tokens_used || 0,
          cache_creation_tokens: 0,
          cache_read_tokens: 0,
          reasoning_tokens: 0,
        });
      }
    } finally {
      db.close();
    }

    return entries;
  },
};
