import type { SupportedAgent } from "@tokenboard/shared";

/**
 * Raw parsed entry from an agent's local logs.
 * This is the ONLY shape a parser may return.
 * The sanitizer will further filter and round before transmission.
 */
export interface RawParsedEntry {
  timestamp: Date;
  agent: SupportedAgent;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
}

export interface ParseOptions {
  since?: Date;
  until?: Date;
}

export interface Parser {
  name: SupportedAgent;
  isAvailable(): Promise<boolean>;
  parse(options: ParseOptions): Promise<RawParsedEntry[]>;
}
