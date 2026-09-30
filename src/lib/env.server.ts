import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";

// Server-only configuration. Secrets are read at request time, never inlined into the client bundle.

export class ConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing server configuration: ${missing.join(", ")} (see .env.example).`);
    this.name = "ConfigError";
  }
}

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((name) => !read(name));
  if (missing.length) throw new ConfigError(missing);
  return Object.fromEntries(names.map((name) => [name, read(name)!]));
}

export function getAppUrl(): string {
  return requireEnv(["APP_URL"]).APP_URL.replace(/\/+$/, "");
}

// Privileged Supabase key: only for narrow server operations after the actor is checked.
export function getSupabaseSecretKey(): string {
  return requireEnv(["SUPABASE_SECRET_KEY"]).SUPABASE_SECRET_KEY;
}

// Used only by the authenticated route generation endpoint.
export function getOpenAIConfig(): { apiKey: string; model: string } | null {
  const apiKey = read("OPENAI_API_KEY");
  const model = read("OPENAI_MODEL");
  return apiKey && model ? { apiKey, model } : null;
}

export function getDemoConfig(): { enabled: boolean } {
  return { enabled: read("DEMO_ENABLED") === "true" };
}

export function getCronSecret(): string {
  return requireEnv(["CRON_SECRET"]).CRON_SECRET;
}

export type ConfigReport = { missingRequired: string[]; missingOptional: string[] };

// Required: the app cannot sign anyone in without them. Optional: only specific features degrade.
export function checkConfig(): ConfigReport {
  const missingRequired = isSupabaseConfigured()
    ? []
    : ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!read("APP_URL")) missingRequired.push("APP_URL");
  const optional = ["SUPABASE_SECRET_KEY", "OPENAI_API_KEY", "OPENAI_MODEL", "CRON_SECRET"];
  return { missingRequired, missingOptional: optional.filter((name) => !read(name)) };
}
