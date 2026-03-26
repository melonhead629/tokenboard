/**
 * Tokenboard CLI
 *
 * Security-first tokenmaxxing leaderboard.
 * Tracks AI token usage locally, submits only anonymized metrics.
 */

import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { ALL_PARSERS } from "./parsers/index.js";
import { sanitize } from "./security/sanitizer.js";
import { auditPayload } from "./security/auditor.js";
import {
  CLIENT_VERSION,
  getLastSubmitTime,
  setLastSubmitTime,
} from "./config.js";
import * as api from "./api/client.js";

const program = new Command();

program
  .name("tokenboard")
  .description("The multiplayer leaderboard for AI token usage")
  .version(CLIENT_VERSION);

// ─── SCAN ──────────────────────────────────────────────────────────
// Local only. No network calls. Shows what's on your machine.

program
  .command("scan")
  .description("Scan local AI agent logs (no data sent)")
  .option("--since <date>", "Start date (YYYY-MM-DD)")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--agent <agent>", "Filter by agent (claude-code, codex, cursor)")
  .action(async (opts) => {
    const since = opts.since ? new Date(opts.since) : undefined;
    const until = opts.until ? new Date(opts.until) : undefined;

    console.log(chalk.bold("\n🔍 Scanning local AI agent logs...\n"));

    let totalEntries = 0;
    let totalTokens = 0;
    let totalCost = 0;

    const agentFilter = opts.agent;

    for (const parser of ALL_PARSERS) {
      if (agentFilter && parser.name !== agentFilter) continue;

      const available = await parser.isAvailable();
      if (!available) {
        console.log(chalk.dim(`  ${parser.name}: not found`));
        continue;
      }

      try {
        const entries = await parser.parse({ since, until });
        const payload = sanitize(entries, CLIENT_VERSION);

        let agentTokens = 0;
        let agentCost = 0;
        for (const e of payload.entries) {
          const t =
            e.input_tokens +
            e.output_tokens +
            e.cache_creation_tokens +
            e.cache_read_tokens +
            e.reasoning_tokens;
          agentTokens += t;
          agentCost += e.estimated_cost_usd;
        }

        totalEntries += payload.entries.length;
        totalTokens += agentTokens;
        totalCost += agentCost;

        console.log(
          `  ${chalk.green("✓")} ${chalk.bold(parser.name)}: ${payload.entries.length.toLocaleString()} sessions, ${agentTokens.toLocaleString()} tokens, $${agentCost.toFixed(2)}`
        );
      } catch (err) {
        console.log(`  ${chalk.red("✗")} ${parser.name}: ${err}`);
      }
    }

    console.log();
    console.log(
      chalk.bold(
        `Total: ${totalEntries.toLocaleString()} sessions, ${totalTokens.toLocaleString()} tokens, $${totalCost.toFixed(2)}`
      )
    );
    console.log(chalk.dim("\nNo data was sent. Use `tokenboard submit` to compete."));
  });

// ─── SUBMIT ────────────────────────────────────────────────────────
// Sends sanitized data to the API.

program
  .command("submit")
  .description("Submit usage data to the leaderboard")
  .option("--since <date>", "Start date (YYYY-MM-DD)")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--since-last", "Only submit data since the last successful submission")
  .option("--agent <agent>", "Filter by agent")
  .option("--dry-run", "Show what would be sent without sending")
  .option("--quiet", "Suppress output (for hooks/automation)")
  .action(async (opts) => {
    const quiet = !!opts.quiet;
    const log = quiet ? () => {} : console.log;

    // Resolve --since-last to an actual date
    let since = opts.since ? new Date(opts.since) : undefined;
    const until = opts.until ? new Date(opts.until) : undefined;

    if (opts.sinceLast) {
      const lastSubmit = await getLastSubmitTime();
      if (lastSubmit) {
        since = lastSubmit;
        log(chalk.dim(`Submitting data since last sync: ${lastSubmit.toISOString()}`));
      } else {
        log(chalk.dim("No previous submission found. Submitting all data."));
      }
    }

    const submitStartTime = new Date();

    // Parse all available agents
    const allEntries = [];
    for (const parser of ALL_PARSERS) {
      if (opts.agent && parser.name !== opts.agent) continue;
      if (!(await parser.isAvailable())) continue;

      try {
        const entries = await parser.parse({ since, until });
        allEntries.push(...entries);
      } catch {
        // Skip failed parsers
      }
    }

    if (allEntries.length === 0) {
      log(chalk.dim("No new usage data. Nothing to submit."));
      return;
    }

    // Sanitize
    const payload = sanitize(allEntries, CLIENT_VERSION);

    // Dry run?
    if (opts.dryRun) {
      auditPayload(payload);
      return;
    }

    // Submit
    log(
      chalk.bold(
        `Submitting ${payload.entries.length.toLocaleString()} entries...`
      )
    );

    const result = await api.submitUsage(payload);
    if (result.ok) {
      // Update high-water mark on success
      await setLastSubmitTime(submitStartTime);
      log(chalk.green("✓ Submitted successfully!"));
    } else {
      log(chalk.red(`✗ Failed: ${result.error}`));
      // Exit with error code for hook visibility
      if (quiet) process.exit(1);
    }
  });

// ─── LEADERBOARD ───────────────────────────────────────────────────

program
  .command("leaderboard")
  .description("View the global leaderboard")
  .option(
    "--period <period>",
    "Time period (today, week, month, all)",
    "week"
  )
  .option("--team <slug>", "View a team leaderboard instead")
  .option("--limit <n>", "Number of entries", "20")
  .action(async (opts) => {
    const query = {
      period: opts.period as "today" | "week" | "month" | "all",
      metric: "tokens" as const,
      agent: "all" as const,
      limit: parseInt(opts.limit),
      offset: 0,
    };

    const result = opts.team
      ? await api.getTeamLeaderboard(opts.team, query)
      : await api.getGlobalLeaderboard(query);

    if (!result.ok) {
      console.log(chalk.red(`Error: ${result.error}`));
      return;
    }

    const data = result.data!;
    const table = new Table({
      head: [
        chalk.dim("#"),
        chalk.bold("User"),
        chalk.bold("Tokens"),
        chalk.bold("Cost"),
        chalk.bold("Streak"),
        chalk.bold("Top Agent"),
      ],
      style: { head: [], border: [] },
    });

    for (const entry of data.entries) {
      const medal =
        entry.rank === 1
          ? "🥇"
          : entry.rank === 2
            ? "🥈"
            : entry.rank === 3
              ? "🥉"
              : String(entry.rank);

      table.push([
        medal,
        entry.username,
        entry.total_tokens.toLocaleString(),
        `$${entry.total_cost.toFixed(2)}`,
        `${entry.streak}d`,
        entry.top_agent,
      ]);
    }

    console.log();
    console.log(
      chalk.bold(
        opts.team
          ? `Team "${opts.team}" Leaderboard (${opts.period})`
          : `Global Leaderboard (${opts.period})`
      )
    );
    console.log(table.toString());
  });

// ─── TEAM ──────────────────────────────────────────────────────────

const team = program.command("team").description("Manage teams");

team
  .command("create <name> <slug>")
  .description("Create a new team")
  .option("--public", "Make the leaderboard publicly visible")
  .action(async (name: string, slug: string, opts) => {
    const result = await api.createTeam(name, slug, opts.public);
    if (result.ok) {
      console.log(chalk.green(`✓ Team "${name}" created!`));
      console.log(
        chalk.bold(`  Invite code: ${result.data!.invite_code}`)
      );
      console.log(
        chalk.dim("  Share this code with teammates to let them join.")
      );
    } else {
      console.log(chalk.red(`✗ Failed: ${result.error}`));
    }
  });

team
  .command("join <invite-code>")
  .description("Join a team with an invite code")
  .action(async (inviteCode: string) => {
    // The API will resolve the team from the invite code
    const result = await api.joinTeam("_", inviteCode);
    if (result.ok) {
      console.log(chalk.green("✓ Joined team!"));
    } else {
      console.log(chalk.red(`✗ Failed: ${result.error}`));
    }
  });

// ─── DELETE ────────────────────────────────────────────────────────

program
  .command("delete-my-data")
  .description("Delete all your data from Tokenboard (irreversible)")
  .action(async () => {
    console.log(
      chalk.red.bold("\n⚠ This will permanently delete ALL your data:")
    );
    console.log("  - All submitted usage data");
    console.log("  - Your profile");
    console.log("  - Team memberships");
    console.log();

    const prompt = "Type DELETE to confirm: ";
    process.stdout.write(prompt);

    const { createInterface } = await import("readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const input = await new Promise<string>((resolve) => {
      rl.question("", (answer) => { rl.close(); resolve(answer.trim()); });
    });

    if (input !== "DELETE") {
      console.log(chalk.dim("Cancelled."));
      return;
    }

    const result = await api.deleteMyData();
    if (result.ok) {
      console.log(chalk.green("✓ All data deleted."));
    } else {
      console.log(chalk.red(`✗ Failed: ${result.error}`));
    }
  });

// ─── INSTALL ───────────────────────────────────────────────────────
// Auto-submit hook for Claude Code. One command, always-on competition.

program
  .command("install")
  .description("Install auto-submit hook into Claude Code")
  .action(async () => {
    const { readFile, writeFile, mkdir } = await import("fs/promises");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const claudeDir = join(homedir(), ".claude");
    const settingsPath = join(claudeDir, "settings.json");

    // Use npx for portability — works even if not globally installed
    // Use absolute path to built bundle until published to npm
    // After `npm publish`, this can become: npx tokenboard submit --since-last --quiet
    const hookCmd = `node ${join(homedir(), "Desktop", "tokenboard", "packages", "cli", "dist", "index.js")} submit --since-last --quiet`;

    const hookEntry = {
      matcher: "",
      hooks: [
        {
          type: "command" as const,
          command: hookCmd,
          timeout: 30,
        },
      ],
    };

    try {
      await mkdir(claudeDir, { recursive: true });

      // Read existing settings (or start fresh)
      let settings: Record<string, unknown> = {};
      try {
        const existing = await readFile(settingsPath, "utf-8");
        settings = JSON.parse(existing);
      } catch {
        // No existing settings file
      }

      // Claude Code hooks format: { hooks: { EventName: [ { matcher, hooks: [...] } ] } }
      const allHooks = (settings.hooks || {}) as Record<string, unknown[]>;
      const stopHooks = (allHooks.Stop || []) as Array<{
        matcher?: string;
        hooks?: Array<{ type: string; command: string }>;
        type?: string;
        command?: string;
      }>;

      // Check if already installed (in any format)
      const alreadyInstalled = stopHooks.some((entry) => {
        // Check nested format
        if (entry.hooks) {
          return entry.hooks.some((h) => h.command?.includes("tokenboard"));
        }
        // Check flat format
        return entry.command?.includes("tokenboard");
      });

      if (alreadyInstalled) {
        console.log(chalk.yellow("Tokenboard hook is already installed."));
        console.log(chalk.dim("Run `tokenboard uninstall` to remove it."));
        return;
      }

      // Add our hook in the correct Claude Code format
      stopHooks.push(hookEntry);
      allHooks.Stop = stopHooks;
      settings.hooks = allHooks;

      await writeFile(settingsPath, JSON.stringify(settings, null, 2));

      console.log();
      console.log(chalk.green.bold("✓ Tokenboard hook installed!"));
      console.log();
      console.log("Every time a Claude Code session ends, your token usage");
      console.log("will be automatically submitted to the leaderboard.");
      console.log();
      console.log(chalk.dim("Hook details:"));
      console.log(chalk.dim(`  Event:   Stop (session end)`));
      console.log(chalk.dim(`  Command: ${hookCmd}`));
      console.log(chalk.dim(`  File:    ${settingsPath}`));
      console.log();
      console.log(chalk.dim("Only token counts are sent. Never code, prompts, or paths."));
      console.log(chalk.dim("Run `tokenboard submit --dry-run` to verify anytime."));
      console.log(chalk.dim("Run `tokenboard uninstall` to remove the hook."));
    } catch (err) {
      console.log(chalk.red(`✗ Failed to install hook: ${err}`));
    }
  });

program
  .command("uninstall")
  .description("Remove auto-submit hook from Claude Code")
  .action(async () => {
    const { readFile, writeFile } = await import("fs/promises");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const settingsPath = join(homedir(), ".claude", "settings.json");

    try {
      const existing = await readFile(settingsPath, "utf-8");
      const settings = JSON.parse(existing) as Record<string, unknown>;
      const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
      const stopHooks = (hooks.Stop || []) as Array<{
        matcher?: string;
        hooks?: Array<{ type: string; command: string }>;
        type?: string;
        command?: string;
      }>;

      // Filter out any entry that contains "tokenboard" in any format
      const filtered = stopHooks.filter((entry) => {
        if (entry.hooks) {
          return !entry.hooks.some((h) => h.command?.includes("tokenboard"));
        }
        return !entry.command?.includes("tokenboard");
      });

      if (filtered.length === stopHooks.length) {
        console.log(chalk.dim("No Tokenboard hook found. Nothing to remove."));
        return;
      }

      hooks.Stop = filtered;
      if (filtered.length === 0) delete hooks.Stop;
      if (Object.keys(hooks).length === 0) delete settings.hooks;

      await writeFile(settingsPath, JSON.stringify(settings, null, 2));

      console.log(chalk.green("✓ Tokenboard hook removed."));
      console.log(chalk.dim("Auto-submit is now disabled."));
    } catch {
      console.log(chalk.dim("No settings file found. Nothing to remove."));
    }
  });

program.parse();
