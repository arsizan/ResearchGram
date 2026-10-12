# Database migrations

These files are the database schema, in the order it was built. Any change made in the
Supabase dashboard must also be added here as a new file, or the next environment will
not have it.

| File | What it does |
|---|---|
| `20261011000000_baseline.sql` | The schema as found on the Sydney project on 11 Oct 2026: tables, indexes, functions, policies, grants, realtime tables, storage buckets. Rebuilt from the read-only report query. |
| `20261011120000_lockdown.sql` | Emergency lock-down: the anon key loses all table access, RLS on for the workspace tables, storage listing closed, uploads only into your own folder. |
| `20261012000000_rls_everywhere.sql` | Row level security on every table, profile created by a trigger at sign-up, profile email locked to the login email, private `workspace-files` bucket, `post_engagement_counts` function. Safe to run more than once. |
| `20261013000000_upload_limits.sql` | Size limits and allowed file types for every storage bucket, matching `lib/uploadRules.ts` (audit RG-21). Safe to run more than once. |
| `20261014000000_conversation_summaries.sql` | `my_conversation_summaries()`: unread count and last message for each of my chats, used by the Messages page and the nav badge (audit RG-18, RG-19). Read times are stored with the database clock. Safe to run more than once. |
| `20261015000000_phase3_server_side.sql` | `readable_post_texts()` (full text only for readers allowed to see it, RG-07); paper access requests always start as pending; research metrics fetched from OpenAlex by the database and protected from browser writes (RG-09, enables the `http` extension); search, directory, suggestions and collaborator recommendations as database functions (RG-06). Works with older app code, so run it **before** deploying the Phase 3 code. Safe to run more than once. |
| `20261015010000_close_post_text.sql` | Signed-in users may read every column of `contents` except `content`; the text then only comes from `readable_post_texts()` (RG-07). Run it **after** the Phase 3 code is live: older code reads `content` directly. Undo line at the top of the file. Safe to run more than once. |

## Applying them

Open each file, copy all of it into Dashboard → SQL Editor → New query, and Run.

- **New project**: run all of them, in the order above.
- **Existing project** (production is Mumbai): run only the files it does not have yet,
  oldest first. Files from `20261012000000_rls_everywhere.sql` on are safe to run twice,
  so running one again by mistake does no harm.

When the Supabase CLI is set up later, mark these as already applied with
`supabase migration repair --status applied <version>` instead of running them again.

## Moving data between projects

`scripts/migrateToMumbai.mjs` copies every table, every login account (same id and
password hash, from `export-users.sql`) and every storage file from one project to
another, then compares counts. Run it with `--dry-run` first. See the comment at the top
of the script for the `.env.migrate` it needs.

## Emergency off switch

If the site breaks right after `20261012000000_rls_everywhere.sql`, this turns the new
row checks off again (back to "any signed-in user can read everything") while the
cause is found. It removes nothing, and running the migration again turns them back on.

```sql
alter table public.profiles disable row level security;
alter table public.contents disable row level security;
alter table public.content_attachments disable row level security;
alter table public.comments disable row level security;
alter table public.paper_extracted_images disable row level security;
alter table public.saved_posts disable row level security;
alter table public.research_requests disable row level security;
alter table public.profile_requests disable row level security;
alter table public.user_connections disable row level security;
alter table public.conversations disable row level security;
alter table public.conversation_members disable row level security;
alter table public.messages disable row level security;
```
