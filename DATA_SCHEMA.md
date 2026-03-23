# Data Schema

This document describes every field that Tokenboard collects and transmits.

## Submission Entry

```typescript
{
  timestamp: string         // ISO 8601, rounded to nearest hour
  agent: string             // Enum: claude-code | codex | cursor | gemini-cli | opencode | amp | roo-code | kilo | copilot | other
  model: string             // e.g. "claude-opus-4-6" — alphanumeric, hyphens, dots, underscores only, max 100 chars
  input_tokens: number      // Non-negative integer
  output_tokens: number     // Non-negative integer
  cache_creation_tokens: number  // Non-negative integer, default 0
  cache_read_tokens: number      // Non-negative integer, default 0
  reasoning_tokens: number       // Non-negative integer, default 0
  estimated_cost_usd: number     // Non-negative float, calculated from pricing table
}
```

## Submission Payload

```typescript
{
  entries: SubmissionEntry[]  // Min 1, max 10,000
  client_version: string     // e.g. "0.1.0", max 20 chars
  idempotency_key: string    // SHA-256 hash of entries, max 64 chars
}
```

## User Profile (Stored Server-Side)

```
id: UUID (generated server-side)
github_id: integer (from GitHub OAuth)
github_username: string (from GitHub)
display_name: string (optional, user-set)
avatar_url: string (from GitHub)
is_public: boolean (opt-in to global leaderboard)
```

## Team (Stored Server-Side)

```
id: UUID
slug: string (URL-safe identifier)
name: string
invite_code: 8-char alphanumeric
is_public: boolean
```

## What We Do NOT Collect

See [SECURITY.md](./SECURITY.md) for the complete list of fields that are never transmitted.
