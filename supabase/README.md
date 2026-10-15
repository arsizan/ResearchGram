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
| `20261017000000_phase5.sql` | Speed: indexes on foreign keys, row checks that work out the signed-in user once per query instead of once per row (the Performance Advisor's findings), search with whole words in any order, word endings, ranking and typo-tolerant names (`search_posts`, `search_researchers`, with `pg_trgm`); the Terms and Privacy Policy consent record (`user_consents`, `accept_terms`, `current_terms_version`), filled in at sign-up; the error log (`error_reports`, `report_error`, `admin_error_reports`, `admin_resolve_error`); data export includes the consent record. Works with the Phase 4 code, so run it **before** deploying the Phase 5 code. Safe to run more than once. |

## Applying them

Open each file, copy all of it into Dashboard → SQL Editor → New query, and Run.

- **New project**: run all of them, in the order above.
- **Existing project** (production is Mumbai): run only the files it does not have yet,
  oldest first. Files from `20261012000000_rls_everywhere.sql` on are safe to run twice,
  so running one again by mistake does no harm.

When the Supabase CLI is set up later, mark these as already applied with
`supabase migration repair --status applied <version>` instead of running them again.

## Admins

Admins see `/admin` (reported posts, error log, audit log). Add one in the SQL editor after the
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
requested (in another browser the reset page says so). To make it work on any device
(phone mail app, another computer), change the template once. Supabase only allows
editing templates once custom SMTP is set up (Authentication → Emails → SMTP
Settings), so this waits for the custom email sender (Resend, after the domain):

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
- **Bot check (CAPTCHA)**: see the next section.
- **JWT signing keys**: Project Settings → JWT Keys → *Migrate JWT secret*, then
  *Rotate keys* (ES256). New sessions are then signed with a key pair, and the
  server-side sign-in check (`proxy.ts`) verifies them itself with the project's
  public keys (`/auth/v1/.well-known/jwks.json`, cached for 10 minutes) instead of
  asking Supabase Auth on every page load. Sessions that already exist keep working
  until they expire (at most an hour); nobody is signed out.
  Do **not** revoke the previous (legacy) secret yet: the legacy `anon` and
  `service_role` keys are signed with it. Revoking is a separate, later step: first
  make sure nothing uses the legacy keys (the app and the scripts use the
  `sb_publishable_…` and `sb_secret_…` keys), disable them under API Keys, wait at
  least 1 hour 15 minutes after the rotation, then revoke.

## Bot check (CAPTCHA) on sign-up, login and password reset

The app shows Cloudflare Turnstile on these three forms when
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set, and sends its token with the request.
Supabase Auth checks the token with Cloudflare, so the secret key only ever goes
into Supabase. Order matters: Supabase rejects every login without a token as soon
as the check is on.

1. Cloudflare dashboard → Turnstile → *Add widget*: hostname `research-gram.vercel.app`
   (add the custom domain later), mode *Managed*. Copy the site key and the secret
   key.
2. Vercel: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the **site** key and redeploy.
   Check that the login page shows the check.
3. Supabase: Authentication → Attack Protection → *Enable CAPTCHA protection* →
   provider *Turnstile by Cloudflare* → paste the **secret** key → Save.
4. Log out and in again, and try "forgot password", to see that it works.

To switch it off: turn the setting off in Supabase **first**, then remove the Vercel
variable. Token refreshes and the links in emails (confirm sign-up, reset password)
do not need the check, so nobody is signed out when it is turned on.

While the check is on, only pages on the widget's hostnames can sign in:

- **Local development** (`npm run dev`) cannot sign in to this project: Cloudflare
  advises against allowing `localhost` on a production widget, and its test keys
  only pass with the test secret. For local work, use a separate development
  Supabase project (the Free plan allows two) with CAPTCHA off, or with the test
  secret `1x0000000000000000000000000000000AA` and the test site key
  `1x00000000000000000000AA` in `.env.local`.
- **Vercel preview deployments** (`*.vercel.app` addresses of branches) cannot sign
  in; test sign-in on the production address.

## Terms and Privacy Policy versions

`/terms` and `/privacy` show the current text; members must be 18 or older. The
version is a date, kept in two places that must match (a database test checks it):
`TERMS_VERSION` in `lib/legal.ts` and `public.current_terms_version()`. New members
accept on the sign-up form (recorded by the sign-up trigger); everyone else is asked
once by a notice behind the login (not on the profile page, so someone who does not
agree can still download their data or delete their account). `user_consents` holds
one row per member: the version they accepted, when, and that they confirmed their
age.

To publish a changed text:

1. Edit the pages and set the new date in `TERMS_VERSION` in `lib/legal.ts` (the
   date shown on the pages follows it).
2. Write a migration that changes only `current_terms_version()` to the same date.
3. Run the migration and push to `main` (Vercel deploys on push), in either order:
   the notice only appears once the app and the database have the same date, so
   nobody is stuck in between. Members who sign up in between are asked once more.

## Error log

Errors from browsers (`components/ErrorReporter.tsx`, the error pages) and from the
server (`instrumentation.ts`) are sent to `report_error()`, which keeps only the
message (300 characters), a short stack, the page path without its query string,
the browser's user-agent text (for server errors: the route), and whether someone
was signed in, never who. Email addresses, ids, sign-in tokens and the part of a
web address after "?" are blanked out. The same error is counted, not stored
again. Limits, because anyone can send a report: 200 new kinds of error an hour
(100 from signed-out visitors, which includes server errors), 2,500 rows in all
(2,000 for signed-out visitors). Errors not seen for 30 days are deleted at the
next report or when an admin opens the list.

Admins read them under `/admin` → Errors and mark them as fixed (written to the
audit log). Reports can be faked, so treat them as hints; Vercel → Logs has the
server errors too. If junk fills the log, clear it in the SQL editor, for example
`delete from public.error_reports where resolved_at is null and message like 'junk%';`.
Nothing is sent from `npm run dev`.

## Security and Performance Advisor: expected findings

After `20261017000000_phase5.sql` these remain, and are intended:

- **0028** (*anon can execute a SECURITY DEFINER function*): `report_error`, so that
  errors on pages before login are logged. It accepts only short text and limits how
  much is stored.
- **0029** (*authenticated can execute a SECURITY DEFINER function*): the app's own
  database functions (`accept_terms`, `admin_*`, `export_my_data`, `search_posts`,
  `verify_orcid` …). Each one checks who is calling before it does anything.
- **0008** (INFO, *RLS enabled, no policy*): `admins`, `audit_log`, `action_rate_limits`,
  `error_reports`. No policy means no direct access; they are used only through
  functions.
- **0005** (INFO, *unused index*): indexes that have not been needed since the last
  statistics reset. Keep them; they matter once there is more data.

Anything else is new and worth a look.

## ORCID sign-in ("Verify with ORCID")

Optional. Without it, the profile works as before and the button is hidden.

1. Register an app at <https://orcid.org/developer-tools> (or, for testing, at
   <https://sandbox.orcid.org/developer-tools>). Redirect URI, exactly:
   `https://research-gram.vercel.app/profile/orcid` (orcid.org only accepts https
   addresses). The free public API is for non-commercial use only: its terms rule out
   use "in connection with any revenue-generating product or service", so a paid
   ResearchGram needs ORCID membership instead.
2. Store the client id and secret in Vault (SQL editor). The secret never goes into
   the app, git or Vercel; only the database reads it.

   ```sql
   select vault.create_secret('APP-XXXXXXXXXXXXXXXX', 'orcid_client_id');
   select vault.create_secret('the-client-secret', 'orcid_client_secret');
   -- only for a sandbox app:
   -- select vault.create_secret('https://sandbox.orcid.org', 'orcid_base_url');
   ```

   Then clear the editor (Ctrl+A, Delete) so the saved query does not keep the secret.
   Check without showing the secret (both must be `true`):
   `select public.orcid_setting('orcid_client_id') is not null as id_ok, public.orcid_setting('orcid_client_secret') is not null as secret_ok;`

   If `create_secret` says the name already exists, change it instead:
   `select vault.update_secret((select id from vault.secrets where name = 'orcid_client_secret'), 'new-secret');`
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
