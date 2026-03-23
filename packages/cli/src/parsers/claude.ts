/**
 * Claude Code Parser
 *
 * Reads JSONL files from ~/.claude/projects/<project>/*.jsonl
 * Extracts ONLY: message.usage.* and message.model from type==="assistant" lines.
 *
 * SECURITY: Never accesses message.content, cwd, gitBranch, or any other field
 * that could reveal what the user is building.
 */

import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { Parser, ParseOptions, RawParsedEntry } from "./types.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export const claudeParser: Parser = {
  name: "claude-code",

  async isAvailable(): Promise<boolean> {
    try {
      await stat(CLAUDE_PROJECTS_DIR);
      return true;
    } catch {
      return false;
    }
  },

  async parse(options: ParseOptions): Promise<RawParsedEntry[]> {
    const entries: RawParsedEntry[] = [];
    const projectDirs = await readdir(CLAUDE_PROJECTS_DIR);

    for (const projectDir of projectDirs) {
      const projectPath = join(CLAUDE_PROJECTS_DIR, projectDir);
      const projectStat = await stat(projectPath).catch(() => null);
      if (!projectStat?.isDirectory()) continue;

      await parseProjectDir(projectPath, options, entries);

      // Also parse subagent logs
      const subagentsPath = join(projectPath, "subagents");
      const subagentsStat = await stat(subagentsPath).catch(() => null);
      if (subagentsStat?.isDirectory()) {
        await parseSubagentsDir(subagentsPath, options, entries);
      }
    }

    return entries;
  },
};

async function parseProjectDir(
  dirPath: string,
  options: ParseOptions,
  entries: RawParsedEntry[]
): Promise<void> {
  const files = await readdir(dirPath);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

  for (const file of jsonlFiles) {
    await parseJsonlFile(join(dirPath, file), options, entries);
  }
}

async function parseSubagentsDir(
  dirPath: string,
  options: ParseOptions,
  entries: RawParsedEntry[]
): Promise<void> {
  const files = await readdir(dirPath);

  for (const dir of files) {
    const subPath = join(dirPath, dir);
    const s = await stat(subPath).catch(() => null);

    if (s?.isDirectory()) {
      await parseProjectDir(subPath, options, entries);
    } else if (dir.endsWith(".jsonl")) {
      await parseJsonlFile(subPath, options, entries);
    }
  }
}

async function parseJsonlFile(
  filePath: string,
  options: ParseOptions,
  entries: RawParsedEntry[]
): Promise<void> {
  const text = await readFile(filePath, "utf-8");

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line);

      // ONLY process assistant messages (these contain usage data)
      if (parsed.type !== "assistant") continue;

      const timestamp = parsed.timestamp
        ? new Date(parsed.timestamp)
        : undefined;
      if (!timestamp || isNaN(timestamp.getTime())) continue;

      // Apply time filters
      if (options.since && timestamp < options.since) continue;
      if (options.until && timestamp > options.until) continue;

      // Extract ONLY usage and model from message
      // SECURITY: We destructure only what we need. Never touch .content
      const message = parsed.message;
      if (!message || typeof message !== "object") continue;

      const model: string = message.model || "unknown";
      const usage: ClaudeUsage = message.usage || {};

      entries.push({
        timestamp,
        agent: "claude-code",
        model,
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_creation_tokens: usage.cache_creation_input_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0,
        reasoning_tokens: 0, // Claude doesn't separate reasoning tokens in logs
      });
    } catch {
      // Skip malformed lines
    }
  }
}
