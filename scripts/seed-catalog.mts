import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";

import { catalogV1 } from "../src/domain/catalog/v1";

// Publishes the TypeScript catalog into service_catalog. Idempotent: an already published
// version must match exactly, because published rows are immutable (migration 0003).

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^['"]|['"]$/g, "")]));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const catalog = catalogV1;

const { data: existing, error } = await admin.from("service_catalog")
  .select("action_id, definition_json").eq("catalog_version", catalog.catalog_version);
if (error) throw error;

if (existing.length) {
  const published = new Map(existing.map((row) => [row.action_id, row.definition_json]));
  const differs = catalog.actions.length !== published.size
    || catalog.actions.some((action) => !isDeepStrictEqual(published.get(action.action_id), action));
  if (differs) throw new Error(`Catalog ${catalog.catalog_version} is already published with different content. Add a new version.`);
  console.log(`catalog ${catalog.catalog_version}: already published, ${existing.length} actions match`);
} else {
  const { error: versionError } = await admin.from("service_catalog_versions")
    .upsert({ catalog_version: catalog.catalog_version, effective_from: catalog.effective_from }, { onConflict: "catalog_version" });
  if (versionError) throw versionError;
  const { error: insertError } = await admin.from("service_catalog").insert(catalog.actions.map((action) => ({
    action_id: action.action_id, catalog_version: catalog.catalog_version, definition_json: action,
  })));
  if (insertError) throw insertError;
  console.log(`catalog ${catalog.catalog_version}: published ${catalog.actions.length} actions`);
}
