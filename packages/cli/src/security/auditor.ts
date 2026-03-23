/**
 * Auditor — Dry-Run & Transparency
 *
 * Shows the user exactly what data would be transmitted.
 * No data leaves the machine when audit mode is active.
 */

import chalk from "chalk";
import type { SubmissionPayload } from "@tokenboard/shared";

export function auditPayload(payload: SubmissionPayload): void {
  console.log();
  console.log(chalk.bold.yellow("═══ DRY RUN — Nothing will be sent ═══"));
  console.log();

  console.log(chalk.dim("Client version:"), payload.client_version);
  console.log(chalk.dim("Idempotency key:"), payload.idempotency_key);
  console.log(chalk.dim("Total entries:"), payload.entries.length);
  console.log();

  // Aggregate stats
  let totalInput = 0;
  let totalOutput = 0;
  let totalCache = 0;
  let totalCost = 0;
  const agents = new Map<string, number>();
  const models = new Map<string, number>();

  for (const entry of payload.entries) {
    totalInput += entry.input_tokens;
    totalOutput += entry.output_tokens;
    totalCache += entry.cache_creation_tokens + entry.cache_read_tokens;
    totalCost += entry.estimated_cost_usd;

    agents.set(entry.agent, (agents.get(entry.agent) || 0) + 1);
    models.set(entry.model, (models.get(entry.model) || 0) + 1);
  }

  console.log(chalk.bold("Aggregate Summary:"));
  console.log(`  Input tokens:  ${totalInput.toLocaleString()}`);
  console.log(`  Output tokens: ${totalOutput.toLocaleString()}`);
  console.log(`  Cache tokens:  ${totalCache.toLocaleString()}`);
  console.log(
    `  Total tokens:  ${(totalInput + totalOutput + totalCache).toLocaleString()}`
  );
  console.log(`  Est. cost:     $${totalCost.toFixed(2)}`);
  console.log();

  console.log(chalk.bold("By Agent:"));
  for (const [agent, count] of agents) {
    console.log(`  ${agent}: ${count} entries`);
  }
  console.log();

  console.log(chalk.bold("By Model:"));
  for (const [model, count] of models) {
    console.log(`  ${model}: ${count} entries`);
  }
  console.log();

  // Show a sample entry
  if (payload.entries.length > 0) {
    console.log(chalk.bold("Sample Entry (first of " + payload.entries.length + "):"));
    console.log(chalk.dim(JSON.stringify(payload.entries[0], null, 2)));
    console.log();
  }

  console.log(chalk.bold.green("Fields that will NEVER be sent:"));
  console.log(chalk.dim("  ✗ Code, diffs, snippets"));
  console.log(chalk.dim("  ✗ Prompts, questions, instructions"));
  console.log(chalk.dim("  ✗ File paths, project names"));
  console.log(chalk.dim("  ✗ Repo URLs, branch names, commits"));
  console.log(chalk.dim("  ✗ Conversation content"));
  console.log(chalk.dim("  ✗ Tool calls or results"));
  console.log();
  console.log(chalk.yellow("To submit for real, run without --dry-run"));
}
