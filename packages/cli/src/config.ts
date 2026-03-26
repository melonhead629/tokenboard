import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".tokenboard");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");

export const CLIENT_VERSION = "0.1.0";

export interface Config {
  api_url: string;
  default_period: "today" | "week" | "month" | "all";
}

export interface AuthData {
  token: string;
  github_username: string;
  expires_at: string;
}

const DEFAULT_CONFIG: Config = {
  api_url: "https://tokenboard-api.alec-430.workers.dev",
  default_period: "week",
};

async function ensureDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
}

export async function getConfig(): Promise<Config> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: Partial<Config>): Promise<void> {
  await ensureDir();
  const existing = await getConfig();
  await writeFile(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2));
}

export async function getAuth(): Promise<AuthData | null> {
  try {
    const data = await readFile(AUTH_FILE, "utf-8");
    const auth = JSON.parse(data) as AuthData;
    if (new Date(auth.expires_at) < new Date()) return null;
    return auth;
  } catch {
    return null;
  }
}

export async function saveAuth(auth: AuthData): Promise<void> {
  await ensureDir();
  await writeFile(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

export async function clearAuth(): Promise<void> {
  try {
    const { unlink } = await import("fs/promises");
    await unlink(AUTH_FILE);
  } catch {
    // Already gone
  }
}

// ─── High-Water Mark ───────────────────────────────────────────────
// Tracks the last successful submission timestamp so --since-last
// only sends new data. Prevents double-counting.

const WATERMARK_FILE = join(CONFIG_DIR, "last_submit.json");

export async function getLastSubmitTime(): Promise<Date | null> {
  try {
    const data = await readFile(WATERMARK_FILE, "utf-8");
    const parsed = JSON.parse(data) as { last_submit: string };
    const date = new Date(parsed.last_submit);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export async function setLastSubmitTime(time: Date): Promise<void> {
  await ensureDir();
  await writeFile(
    WATERMARK_FILE,
    JSON.stringify({ last_submit: time.toISOString() }, null, 2)
  );
}
