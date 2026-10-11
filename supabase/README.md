# Database migrations

These files are the database schema, in the order it was built. Any change made in the
Supabase dashboard must also be added here as a new file, or the next environment will
not have it.

| File | What it does |
|---|---|
| `20261011000000_baseline.sql` | The schema as found on the Sydney project on 11 Oct 2026: tables, indexes, functions, policies, grants, realtime tables, storage buckets. Rebuilt from the read-only report query. |
| `20261011120000_lockdown.sql` | Emergency lock-down: the anon key loses all table access, RLS on for the workspace tables, storage listing closed, uploads only into your own folder. |
| `20261012000000_rls_everywhere.sql` | Row level security on every table, profile created by a trigger at sign-up, profile email locked to the login email, private `workspace-files` bucket, `post_engagement_counts` function. Safe to run more than once. |

## Applying them

Open each file, copy all of it into Dashboard → SQL Editor → New query, and Run.

- **New project** (for example the Mumbai one): run all three, in the order above.
- **Existing Sydney project**: baseline and lock-down are already in place. Run only
  `20261012000000_rls_everywhere.sql`.

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
