# tokenboard

The multiplayer leaderboard for AI token usage. Compete on tokenmaxxing with zero code exposure.

**Tokscale is the speedometer. Tokenboard is the race.**

```
npx tokenboard scan
```

```
🔍 Scanning local AI agent logs...

  ✓ claude-code: 9,362 sessions, 729,819,278 tokens, $2284.84
  ✓ codex: 7 sessions, 10,356,944 tokens, $103.57
  cursor: not found

Total: 9,369 sessions, 740,176,222 tokens, $2388.41
```

## Why Tokenboard

| | Tokscale | Tokenboard |
|---|---|---|
| Local scanning | ✓ | ✓ |
| Global leaderboard | ✓ | ✓ |
| **Private team leaderboards** | ✗ | ✓ |
| **Auto-submit hook** | ✗ | ✓ |
| **Zero code exposure guarantee** | Undocumented | ✓ (3-layer security) |
| **GDPR data deletion** | ✗ | ✓ |
| **Dry-run audit mode** | ✓ | ✓ |
| **Documented data schema** | ✗ | ✓ |

## Quick Start

```bash
# See your local token usage (no data sent)
npx tokenboard scan

# Preview what would be submitted
npx tokenboard submit --dry-run

# Auto-submit after every Claude Code session
npx tokenboard install
```

## Commands

| Command | Description |
|---|---|
| `tokenboard scan` | Scan local AI agent logs. No network calls. |
| `tokenboard submit` | Submit sanitized usage data to the leaderboard |
| `tokenboard submit --dry-run` | Show exact payload without sending |
| `tokenboard submit --since-last` | Only submit new data since last sync |
| `tokenboard install` | Install Claude Code auto-submit hook |
| `tokenboard uninstall` | Remove the auto-submit hook |
| `tokenboard leaderboard` | View the global leaderboard |
| `tokenboard leaderboard --team my-team` | View a team leaderboard |
| `tokenboard team create "Name" slug` | Create a private team |
| `tokenboard team join INVITE_CODE` | Join a team |
| `tokenboard delete-my-data` | Delete all your data (GDPR) |

## Supported Agents

- **Claude Code** — `~/.claude/projects/**/*.jsonl`
- **Codex (OpenAI)** — `~/.codex/state_5.sqlite`
- **Cursor** — `~/Library/Application Support/Cursor/User/globalStorage/ai-tracking/`
- More coming (Gemini CLI, Copilot, OpenCode, Amp, Roo Code)
- Accepts **Tokscale JSON export** for any agent Tokscale already supports

## Security Model

Tokenboard never sees your code. The three-layer security model:

### Layer 1: Parser Isolation
Parsers extract **only** `message.usage` (token counts) and `message.model` from logs. They never touch `content`, `cwd`, `gitBranch`, prompts, tool calls, or any field that could reveal what you're building.

### Layer 2: Sanitizer
Before data leaves your machine:
- **Allowlist enforcement** — only 9 fields pass through (all numeric/enum)
- **Timestamp rounding** — rounded to nearest hour (prevents timing correlation)
- **Model name validation** — alphanumeric only, max 100 chars
- **Strict Zod schema** — `.strict()` rejects any extra fields

### Layer 3: API Validation
The server **rejects** (not strips) payloads with extra fields. Defense in depth.

### What is transmitted (complete list)

```
timestamp           "2026-03-23T14:00:00Z"   (hour-rounded)
agent               "claude-code"             (enum)
model               "claude-opus-4-6"         (validated string)
input_tokens        23520                     (integer)
output_tokens       12                        (integer)
cache_creation_tokens  0                      (integer)
cache_read_tokens   6443                      (integer)
reasoning_tokens    0                         (integer)
estimated_cost_usd  0.36                      (float)
```

That's it. Nine fields. No free text. No paths. No content.

Run `tokenboard submit --dry-run` to verify anytime.

See [SECURITY.md](./SECURITY.md) and [DATA_SCHEMA.md](./DATA_SCHEMA.md) for full details.

## Teams

Create a private leaderboard for your company or team:

```bash
# Create a team (you become admin)
tokenboard team create "Laylo Engineering" laylo-eng

# Share the invite code with teammates
# ✓ Team "Laylo Engineering" created!
#   Invite code: A7X9K2M4

# Teammates join with the code
tokenboard team join A7X9K2M4

# View the team leaderboard
tokenboard leaderboard --team laylo-eng
```

Team data is fully isolated. Non-members cannot see or query team leaderboards.

## Auto-Submit Hook

The killer feature. One command installs a Claude Code hook that auto-submits after every session:

```bash
tokenboard install
```

This writes a `Stop` hook to `~/.claude/settings.json`. When a Claude Code session ends:

1. Hook fires `tokenboard submit --since-last --quiet`
2. CLI reads only new entries since last sync (high-water mark)
3. Sanitizer strips everything except token counts
4. Submits to the leaderboard
5. Updates the high-water mark

No manual step. No double-counting. The leaderboard updates itself.

```bash
# Remove the hook
tokenboard uninstall
```

## Architecture

```
packages/
  shared/     Zod schemas (the security contract), pricing table
  cli/        TypeScript CLI — parsers, sanitizer, commands
  api/        Hono on Cloudflare Workers — auth, submissions, leaderboards
  web/        Next.js dashboard — leaderboard, profiles, heatmaps
```

## Tech Stack

| Layer | Tech |
|---|---|
| CLI | TypeScript + Node.js |
| API | Hono + Cloudflare Workers + D1 |
| Web | Next.js + Tailwind |
| Auth | GitHub OAuth (device flow) |
| Teams | Invite codes (SSO planned) |

## License

MIT
