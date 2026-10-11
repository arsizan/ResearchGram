/**
 * Moves ResearchGram from the Sydney Supabase project to the Mumbai one.
 *
 *   node --env-file=.env.migrate scripts/migrateToMumbai.mjs --dry-run
 *   node --env-file=.env.migrate scripts/migrateToMumbai.mjs
 *
 * .env.migrate (git-ignored, delete it afterwards):
 *   SOURCE_URL=https://<sydney-ref>.supabase.co
 *   SOURCE_SECRET_KEY=sb_secret_...          Sydney: Project Settings -> API Keys -> Secret keys
 *   TARGET_URL=https://<mumbai-ref>.supabase.co
 *   TARGET_SECRET_KEY=sb_secret_...          Mumbai: same place
 *   CONFIRM_WIPE_TARGET=<mumbai-ref>         proves you mean to empty and refill Mumbai
 *   USERS_FILE=migration/users.csv           output of supabase/export-users.sql on Sydney
 *
 * In order: safety checks, read Sydney (read only), empty Mumbai, recreate every
 * account with its existing id and password hash, copy the 27 tables with file links
 * pointed at Mumbai, copy the storage files (old workspace files move into the private
 * workspace-files bucket), then compare counts. Running it again starts from empty.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { migrate, parseUsersFile } from "./migrate/core.mjs";

const dryRun = process.argv.includes("--dry-run");
const required = ["SOURCE_URL", "SOURCE_SECRET_KEY", "TARGET_URL", "TARGET_SECRET_KEY", "USERS_FILE"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing in .env.migrate: ${missing.join(", ")}`);
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const source = createClient(process.env.SOURCE_URL, process.env.SOURCE_SECRET_KEY, options);
const target = createClient(process.env.TARGET_URL, process.env.TARGET_SECRET_KEY, options);

try {
  const users = parseUsersFile(readFileSync(process.env.USERS_FILE, "utf8"));
  const result = await migrate({
    source,
    target,
    sourceUrl: process.env.SOURCE_URL.replace(/\/+$/, ""),
    targetUrl: process.env.TARGET_URL.replace(/\/+$/, ""),
    users,
    confirmRef: process.env.CONFIRM_WIPE_TARGET,
    dryRun,
    log: (line) => console.log(line),
  });
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(`\nSTOPPED: ${error.message}`);
  process.exit(1);
}
