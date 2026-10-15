// Shared setup for the database tests: an in-memory Postgres (PGlite) with
// Supabase-like roles and schemas, a fake pgsql-http extension (answers from
// test.http_fixtures and records every call), a fake Vault, and the repo's
// migrations applied in order. No network and no Supabase project needed.
// pg_trgm is the real extension (PGlite ships it), as on Supabase.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';

export const MIG = new URL('../../supabase/migrations/', import.meta.url);

export const MIGRATIONS = [
  '20261011000000_baseline.sql',
  '20261011120000_lockdown.sql',
  '20261012000000_rls_everywhere.sql',
  '20261013000000_upload_limits.sql',
  '20261014000000_conversation_summaries.sql',
  '20261015000000_phase3_server_side.sql',
  '20261015010000_close_post_text.sql',
  '20261016000000_phase4.sql',
  '20261016010000_phase4_after_deploy.sql',
  '20261017000000_phase5.sql',
];

const SETUP = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema storage; create schema extensions; create schema test; create schema vault;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts,1)-1]; end $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  -- Fake Vault: same view name and columns the migration reads.
  create table vault.decrypted_secrets (name text, decrypted_secret text, created_at timestamptz default now());
  -- Fake pgsql-http 1.6: same types and function names.
  create type extensions.http_header as (field varchar, value varchar);
  create type extensions.http_response as (status integer, content_type varchar, headers extensions.http_header[], content varchar);
  create domain extensions.http_method as text;
  create type extensions.http_request as (method extensions.http_method, uri varchar, headers extensions.http_header[], content_type varchar, content varchar);
  create table test.http_fixtures (method text not null default 'GET', uri text not null, status integer, content text, location text, primary key (method, uri));
  create table test.http_calls (method text, uri text, content_type text, content text, headers text, at timestamptz default clock_timestamp());
  create function extensions.http(request extensions.http_request) returns extensions.http_response language plpgsql as $$
  declare f record;
  begin
    insert into test.http_calls (method, uri, content_type, content, headers)
    values ((request).method, (request).uri, (request).content_type, (request).content, (request).headers::text);
    select * into f from test.http_fixtures x where x.uri = (request).uri and x.method = (request).method;
    if not found then
      return row(404, 'application/json', array[]::extensions.http_header[], '{"error":"not found"}')::extensions.http_response;
    end if;
    return row(f.status, 'application/json',
               case when f.location is null then array[]::extensions.http_header[]
                    else array[row('Location', f.location)::extensions.http_header] end,
               f.content)::extensions.http_response;
  end $$;
  create function extensions.urlencode(string varchar) returns text language plpgsql immutable as $$
  declare result text := ''; ch text; b bytea; i int;
  begin
    for i in 1..coalesce(length(string), 0) loop
      ch := substr(string, i, 1);
      if ch ~ '[A-Za-z0-9._~-]' then
        result := result || ch;
      else
        b := convert_to(ch, 'UTF8');
        for j in 0..length(b) - 1 loop
          result := result || '%' || upper(lpad(to_hex(get_byte(b, j)), 2, '0'));
        end loop;
      end if;
    end loop;
    return result;
  end $$;`;

/** Runs one migration file, as pasting it into the SQL editor would. */
export async function applyMigration(db, file) {
  await db.exec(readFileSync(new URL(file, MIG), 'utf8').replace('create extension if not exists http with schema extensions;', ''));
}

export async function makeDb({ upTo = MIGRATIONS.length, rerun = [] } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SETUP);
  for (const f of MIGRATIONS.slice(0, upTo)) await applyMigration(db, f);
  for (const f of rerun) await applyMigration(db, f);
  return db;
}

export const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Runs SQL as a signed-in user (or anon when user is null), like PostgREST does. */
export function asUser(db) {
  return (user, sql, params) => db.transaction(async (tx) => {
    await tx.exec(user
      ? `set local role authenticated; set local request.jwt.claim.sub = '${user}';`
      : `set local role anon; set local request.jwt.claim.sub = '';`);
    return (await tx.query(sql, params)).rows;
  });
}
