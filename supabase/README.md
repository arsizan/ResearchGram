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
| `20261016000000_phase4.sql` | Admins (`public.admins`, `is_admin()`), the audit log, the moderation queue and admin functions; data export (`export_my_data`) and account deletion (`delete_my_account`); ORCID verification (`verify_orcid`, secret in Vault); chat attachments and voice messages (private `chat-attachments` bucket), mute, message times set by the database; random Jitsi room names (RG-22); connected people only for direct chats, request chats and workspace invites; a restricted paper opens only through an approved request for its own post; multi-step writes as single functions (RG-20: `create_workspace`, `add_workspace_member`, `start_direct_conversation`, `respond_to_*_request`, `create_post` …). It also tidies older rows: notification links that lead outside the app are removed, and existing meetings get new random rooms. Works with the Phase 3 code, so run it **before** deploying the Phase 4 code. Safe to run more than once. |
| `20261016010000_phase4_after_deploy.sql` | Browsers may no longer update `conversations` (the database moves a chat to the top itself); a chat time set in the future goes back to the time of its last message. Run it **after** the Phase 4 code is live. Undo line in the file. |

## Applying them

Open each file, copy all of it into Dashboard → SQL Editor → New query, and Run.

- **New project**: run all of them, in the order above.
- **Existing project** (production is Mumbai): run only the files it does not have yet,
  oldest first. Files from `20261012000000_rls_everywhere.sql` on are safe to run twice,
  so running one again by mistake does no harm.

When the Supabase CLI is set up later, mark these as already applied with
`supabase migration repair --status applied <version>` instead of running them again.

## Admins

Admins see `/admin` (reported posts, audit log). Add one in the SQL editor after the
person has signed up:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'person@example.com'
on conflict do nothing;
```

Remove: `delete from public.admins where user_id = (select id from auth.users where email = 'person@example.com');`
Both are written to the audit log.

## Reset-password email (works on any device)

The app keeps the session in cookies and uses the PKCE sign-in flow. With Supabase's
default email template, a reset link only works in the browser where the reset was
requested. To make it work on any device (phone mail app, another computer), change
the template once:

Dashboard → Authentication → Emails → **Reset password**: replace the link
`{{ .ConfirmationURL }}` with

```
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

The reset page accepts both kinds of links, so nothing breaks before or after the change.

## Auth settings

- **Secure password change** (recommended): Dashboard → Authentication → Sign In /
  Providers → **Email** → turn on *Secure password change*. A session older than 24
  hours then cannot set a new password without a code sent by email, so someone at
  an unlocked computer cannot take over the account. The app only changes passwords
  from a reset link, which signs the person in fresh, so it keeps working.
- **JWT signing keys** (optional, later): Project Settings → JWT Keys → *Migrate JWT
  secret*, then *Rotate keys*. The server-side sign-in check (`proxy.ts`) can then
  verify sessions without asking Supabase on every page load. Sessions that already
  exist keep working; nobody is signed out.

## ORCID sign-in ("Verify with ORCID")

Optional. Without it, the profile works as before and the button is hidden.

1. Register an app at <https://orcid.org/developer-tools> (or, for testing, at
   <https://sandbox.orcid.org/developer-tools>). Redirect URI:
   `https://research-gram.vercel.app/profile/orcid` (and `http://localhost:3000/profile/orcid`
   for local testing).
2. Store the client id and secret in Vault (SQL editor). The secret never goes into
   the app, git or Vercel; only the database reads it.

   ```sql
   select vault.create_secret('APP-XXXXXXXXXXXXXXXX', 'orcid_client_id');
   select vault.create_secret('the-client-secret', 'orcid_client_secret');
   -- only for a sandbox app:
   -- select vault.create_secret('https://sandbox.orcid.org', 'orcid_base_url');
   ```

   To change one later: `select vault.update_secret((select id from vault.secrets where name = 'orcid_client_secret'), 'new-secret');`
3. In Vercel set `NEXT_PUBLIC_ORCID_CLIENT_ID` (the same client id) and, for a sandbox
   app, `NEXT_PUBLIC_ORCID_BASE_URL=https://sandbox.orcid.org`. Redeploy.

Once `orcid_client_id` is in Vault, research metrics sync only for an iD the person
verified with ORCID.

## Account deletion and data export

Both are on the profile page. Deletion removes the person's files through the Storage
API first (the database cannot delete stored files), then `delete_my_account('DELETE')`
deletes the login and everything that belongs to it in one transaction: posts, comments,
messages, chats with them, workspaces they own (for all members), requests,
connections. Co-author entries on other people's posts keep the name without the link.

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
