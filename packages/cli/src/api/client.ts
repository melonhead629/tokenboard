/**
 * API Client — Authenticated HTTP client for Tokenboard API
 */

import type { SubmissionPayload, LeaderboardQuery } from "@tokenboard/shared";
import { getConfig, getAuth } from "../config.js";

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  authenticated = true
): Promise<ApiResponse<T>> {
  const config = await getConfig();
  const url = `${config.api_url}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authenticated) {
    const auth = await getAuth();
    if (!auth) {
      return { ok: false, error: "Not authenticated. Run `tokenboard login` first." };
    }
    headers["Authorization"] = `Bearer ${auth.token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as T;

    if (!response.ok) {
      return {
        ok: false,
        error: (data as Record<string, string>)?.error || `HTTP ${response.status}`,
      };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Network error: ${err}` };
  }
}

export async function submitUsage(payload: SubmissionPayload): Promise<ApiResponse> {
  return request("POST", "/api/v1/submissions", payload);
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar_url: string;
  total_tokens: number;
  total_cost: number;
  streak: number;
  top_agent: string;
}

export async function getGlobalLeaderboard(
  query: LeaderboardQuery
): Promise<ApiResponse<{ entries: LeaderboardEntry[]; total: number }>> {
  const params = new URLSearchParams();
  params.set("period", query.period);
  params.set("metric", query.metric);
  params.set("agent", query.agent);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));

  return request("GET", `/api/v1/leaderboard/global?${params}`);
}

export async function getTeamLeaderboard(
  slug: string,
  query: LeaderboardQuery
): Promise<ApiResponse<{ entries: LeaderboardEntry[]; total: number }>> {
  const params = new URLSearchParams();
  params.set("period", query.period);
  params.set("metric", query.metric);
  params.set("agent", query.agent);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));

  return request("GET", `/api/v1/leaderboard/team/${slug}?${params}`);
}

export async function createTeam(
  name: string,
  slug: string,
  isPublic = false
): Promise<ApiResponse<{ invite_code: string; slug: string }>> {
  return request("POST", "/api/v1/teams", { name, slug, is_public: isPublic });
}

export async function joinTeam(
  slug: string,
  inviteCode: string
): Promise<ApiResponse> {
  return request("POST", `/api/v1/teams/${slug}/join`, {
    invite_code: inviteCode,
  });
}

export async function deleteMyData(): Promise<ApiResponse> {
  return request("DELETE", "/api/v1/users/me");
}
