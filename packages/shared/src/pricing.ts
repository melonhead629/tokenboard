/**
 * Model pricing table for estimating costs.
 * Prices in USD per 1M tokens. Updated 2026-03.
 */

export interface ModelPricing {
  input_per_1m: number;
  output_per_1m: number;
  cache_creation_per_1m?: number;
  cache_read_per_1m?: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-6": {
    input_per_1m: 15,
    output_per_1m: 75,
    cache_creation_per_1m: 18.75,
    cache_read_per_1m: 1.5,
  },
  "claude-sonnet-4-6": {
    input_per_1m: 3,
    output_per_1m: 15,
    cache_creation_per_1m: 3.75,
    cache_read_per_1m: 0.3,
  },
  "claude-haiku-4-5": {
    input_per_1m: 0.8,
    output_per_1m: 4,
    cache_creation_per_1m: 1,
    cache_read_per_1m: 0.08,
  },

  // OpenAI
  "gpt-4o": {
    input_per_1m: 2.5,
    output_per_1m: 10,
  },
  "gpt-4o-mini": {
    input_per_1m: 0.15,
    output_per_1m: 0.6,
  },
  "o3": {
    input_per_1m: 10,
    output_per_1m: 40,
  },
  "o3-mini": {
    input_per_1m: 1.1,
    output_per_1m: 4.4,
  },
  "o4-mini": {
    input_per_1m: 1.1,
    output_per_1m: 4.4,
  },
  codex: {
    input_per_1m: 2.5,
    output_per_1m: 10,
  },

  // Google
  "gemini-2.5-pro": {
    input_per_1m: 1.25,
    output_per_1m: 10,
  },
  "gemini-2.5-flash": {
    input_per_1m: 0.15,
    output_per_1m: 0.6,
  },
};

// Fuzzy match: "claude-opus-4-6-20260301" -> "claude-opus-4-6"
function findPricing(model: string): ModelPricing | null {
  if (PRICING[model]) return PRICING[model];

  // Try prefix match (longest first)
  const sorted = Object.keys(PRICING).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (model.startsWith(key)) return PRICING[key];
  }

  // Try contains match for common patterns
  for (const key of sorted) {
    if (model.includes(key)) return PRICING[key];
  }

  return null;
}

export function estimateCost(
  model: string,
  tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  }
): number {
  const pricing = findPricing(model);
  if (!pricing) return 0; // Unknown model, can't estimate

  let cost = 0;
  cost += (tokens.input_tokens / 1_000_000) * pricing.input_per_1m;
  cost += (tokens.output_tokens / 1_000_000) * pricing.output_per_1m;

  if (tokens.cache_creation_tokens && pricing.cache_creation_per_1m) {
    cost +=
      (tokens.cache_creation_tokens / 1_000_000) *
      pricing.cache_creation_per_1m;
  }
  if (tokens.cache_read_tokens && pricing.cache_read_per_1m) {
    cost +=
      (tokens.cache_read_tokens / 1_000_000) * pricing.cache_read_per_1m;
  }

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}
