/**
 * Cursor Parser
 *
 * Reads from ~/Library/Application Support/Cursor/User/globalStorage/ai-tracking/
 * Falls back to accepting Tokscale JSON export for Cursor data.
 *
 * SECURITY: Only extracts token counts and model identifiers.
 * Never reads prompts, code, file paths, or conversation content.
 */

import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import { homedir, platform } from "os";
import type { Parser, ParseOptions, RawParsedEntry } from "./types.js";

function getCursorTrackingDir(): string {
  const os = platform();
  if (os === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "globalStorage",
      "ai-tracking"
    );
  }
  if (os === "win32") {
    return join(
      homedir(),
      "AppData",
      "Roaming",
      "Cursor",
      "User",
      "globalStorage",
      "ai-tracking"
    );
  }
  // Linux
  return join(
    homedir(),
    ".config",
    "Cursor",
    "User",
    "globalStorage",
    "ai-tracking"
  );
}

export const cursorParser: Parser = {
  name: "cursor",

  async isAvailable(): Promise<boolean> {
    try {
      await stat(getCursorTrackingDir());
      return true;
    } catch {
      return false;
    }
  },

  async parse(options: ParseOptions): Promise<RawParsedEntry[]> {
    const entries: RawParsedEntry[] = [];
    const dir = getCursorTrackingDir();

    try {
      const files = await readdir(dir);
      const jsonFiles = files.filter(
        (f) => f.endsWith(".json") || f.endsWith(".jsonl")
      );

      for (const file of jsonFiles) {
        const content = await readFile(join(dir, file), "utf-8");

        // Try JSONL format first
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            const entry = extractCursorEntry(record, options);
            if (entry) entries.push(entry);
          } catch {
            // Try as single JSON object
            try {
              const record = JSON.parse(content);
              if (Array.isArray(record)) {
                for (const item of record) {
                  const entry = extractCursorEntry(item, options);
                  if (entry) entries.push(entry);
                }
              } else {
                const entry = extractCursorEntry(record, options);
                if (entry) entries.push(entry);
              }
            } catch {
              // Skip unparseable files
            }
            break; // Already tried whole file
          }
        }
      }
    } catch {
      // Directory not available
    }

    return entries;
  },
};

function extractCursorEntry(
  record: Record<string, unknown>,
  options: ParseOptions
): RawParsedEntry | null {
  // Look for common Cursor tracking fields
  const timestamp = record.timestamp || record.created_at || record.time;
  if (!timestamp) return null;

  const date = new Date(timestamp as string | number);
  if (isNaN(date.getTime())) return null;
  if (options.since && date < options.since) return null;
  if (options.until && date > options.until) return null;

  const model =
    (record.model as string) ||
    (record.modelName as string) ||
    (record.model_id as string) ||
    "unknown";

  // Extract token counts from various possible field names
  const inputTokens =
    (record.input_tokens as number) ||
    (record.promptTokens as number) ||
    (record.prompt_tokens as number) ||
    0;
  const outputTokens =
    (record.output_tokens as number) ||
    (record.completionTokens as number) ||
    (record.completion_tokens as number) ||
    0;

  if (inputTokens === 0 && outputTokens === 0) return null;

  return {
    timestamp: date,
    agent: "cursor",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    reasoning_tokens: 0,
  };
}
