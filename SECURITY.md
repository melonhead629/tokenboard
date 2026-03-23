# Security Model

Tokenboard is designed so companies can trust their employees using it. **Zero code or intellectual property is ever transmitted.**

## Three-Layer Defense

### Layer 1: Parser Isolation (Client-Side)

Each parser extracts ONLY:
- `message.usage.*` (token counts)
- `message.model` (model identifier)
- `timestamp`

Parsers **never access**: `content`, `cwd`, `gitBranch`, `first_user_message`, `title`, `git_origin_url`, tool calls, tool results, or any field that could reveal what you're building.

### Layer 2: Sanitizer (Client-Side)

Before any data leaves your machine, the sanitizer:
1. **Allowlist enforcement** — Only fields in the Zod schema pass through. Everything else is dropped.
2. **Timestamp rounding** — All timestamps rounded to nearest hour (prevents timing correlation).
3. **Model name validation** — Only alphanumeric, hyphens, dots, underscores. Max 100 chars.
4. **Size limits** — Max 10,000 entries per submission.

### Layer 3: API Validation (Server-Side)

The API uses `.strict()` Zod schemas that **reject** (not strip) payloads with extra fields. If a client bug accidentally includes an extra field, the submission fails loudly rather than silently storing unexpected data.

## What Is Transmitted

| Field | Example | Why |
|-------|---------|-----|
| `timestamp` | `2026-03-23T14:00:00.000Z` | Rounded to hour. For daily aggregation. |
| `agent` | `claude-code` | Enum. For agent breakdown charts. |
| `model` | `claude-opus-4-6` | For model breakdown and cost estimation. |
| `input_tokens` | `23520` | Core metric. |
| `output_tokens` | `12` | Core metric. |
| `cache_creation_tokens` | `0` | For accurate cost estimation. |
| `cache_read_tokens` | `6443` | For accurate cost estimation. |
| `reasoning_tokens` | `0` | For models that separate reasoning. |
| `estimated_cost_usd` | `0.36` | Calculated client-side from pricing table. |

**That's it.** Nine numeric/enum fields per entry. No free text. No paths. No content.

## What Is NEVER Transmitted

- Code, diffs, or snippets
- Prompts, questions, or instructions
- File paths, project names, or directory names
- Repository URLs, branch names, or commit hashes
- Conversation content or assistant responses
- Tool calls, tool results, or tool names
- Session IDs or working directories
- System information beyond the agent identifier
- Any free-text field

## Verification

Run `tokenboard submit --dry-run` to see the exact JSON payload before anything leaves your machine.

## Team Isolation

- Private team leaderboards are only visible to members
- Membership requires an invite code shared out-of-band
- Non-members cannot query team data via the API
- Team admins can regenerate invite codes (invalidating old ones)

## Data Deletion

Run `tokenboard delete-my-data` to permanently delete all your data. This cascades through all tables including submissions, aggregates, and team memberships.

## Reporting Vulnerabilities

Email security@tokenboard.dev with details. We'll respond within 48 hours.
