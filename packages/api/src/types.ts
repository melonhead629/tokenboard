export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
}

export interface AuthUser {
  id: string;
  github_id: number;
  github_username: string;
}
