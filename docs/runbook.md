# ResearchGram operations runbook

What to do regularly, and what to do when something goes wrong. Production is the
Supabase project in Mumbai and the Vercel project `research-gram`.

## 1. Backups

**The Supabase Free plan makes no backups.** Until the project moves to the Pro plan
(daily backups kept 7 days; point-in-time recovery as an add-on), backups are manual.

### When

- Every week, and
- right before running any migration in `supabase/migrations/`, and
- before deleting data by hand.

### Database dump (Windows PowerShell)

Needs the PostgreSQL 17 client tools (`pg_dump`, `pg_restore`), installed once from
<https://www.postgresql.org/download/windows/> ("Command Line Tools" is enough).

1. Dashboard → **Connect** → *Session pooler* → copy the connection string and put the
   database password in it.
2. Run (one command, all on one line):

   ```powershell
   pg_dump --dbname "PASTE-CONNECTION-STRING" --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=storage --file "D:\ResearchGram-backups\rg-2026-10-20.dump"
   ```

3. Check the file is not empty: `pg_restore --list "D:\ResearchGram-backups\rg-2026-10-20.dump"`
   prints a long table of contents.

Rules for backup files:

- They contain everyone's private data **and password hashes** (`auth` schema).
  Keep them on an encrypted drive you control. Never put them in the repo, in
  chat, in email, or in a shared folder.
- Delete every dump and file backup older than 28 days, including the ones made
  before migrations, and delete restore-test projects when the test is done. The
  Privacy Policy promises that deleted accounts are gone from backups within about
  30 days.
- Never paste the connection string (it contains the password) anywhere else.

### Stored files (`npm run backup:files`)

A database dump does not contain the files in Storage (avatars, papers, workspace and
chat files). Copy them with every database dump:

1. Once: Dashboard → Project Settings → **API Keys** → *Secret keys* → create a key
   named `backup`. In the project folder create `.env.backup` (git-ignored; it stays on
   this computer):

   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   BACKUP_DIR=D:\ResearchGram-backups\files
   ```

2. Run `npm run backup:files`. Each run makes a new dated folder inside `BACKUP_DIR`
   with every file of every bucket and `manifest.json` (the size and SHA-256 of each
   file). It refuses a `BACKUP_DIR` inside the project folder, so backups cannot end
   up in git, and it ends with an error if any file could not be saved.
3. Keep them for 28 days at most, like the dumps. They hold private papers and
   messages: the same rules apply.

### Restore test (every 3 months)

A backup that was never restored is a hope, not a backup. The Free plan allows two
active projects, so with only production running there is room for a scratch project:

1. Create a scratch Supabase project (any region).
2. `pg_restore --dbname "SCRATCH-CONNECTION-STRING" --no-owner --clean --if-exists "D:\...\rg-latest.dump"`
   (some "already exists" messages about Supabase's own schemas are normal).
3. Open a few tables and count rows (`select count(*) from public.profiles;` and so on),
   and compare one or two files with the file backup's `manifest.json`.
4. Delete the scratch project, and note the date in the project notes.

## 2. Regular checks

| How often | What |
|---|---|
| Weekly | Admin console (`/admin`): open reports, the **error log** (new errors, or old ones that came back; fix them, then *Mark as fixed*), and the audit log for anything unexpected (admin changes, many account deletions, paper-access decisions). |
| Weekly | Supabase Dashboard → **Advisors** (Security and Performance). Fix every new warning; the expected ones are listed in `supabase/README.md`. |
| Weekly | Database dump and `npm run backup:files` (above). |
| Every push | GitHub Actions: lint, types, build, database tests, script tests, browser tests, dependency audit. Do not deploy a red build. |
| Monthly | `npm outdated` and `npm audit`; apply security updates (Next.js, Supabase libraries). |
| Monthly | Vercel → Logs and Supabase → Logs: repeated errors, unusual traffic. Vercel → Firewall: what the bot check and the rate limit stopped (section 6). |
| Monthly | Leftover chat files (section 5). |
| Monthly | Delete audit-log entries older than two years (the Privacy Policy promises it): `delete from public.audit_log where occurred_at < now() - interval '2 years';` |
| Every 3 months | Restore test (above). Check two-factor sign-in still works on every account (section 6). |

## 3. Incidents

An incident is anything that exposes or loses data, or takes the site down: a leaked key,
data visible to the wrong people, spam or abuse at scale, data deleted by mistake.

1. **Contain first.**
   - Data exposed by a rule: run the matching undo/off switch from `supabase/README.md`,
     or temporarily revoke the grant, then fix properly.
   - Abuse from one account: remove its posts from `/admin`; in Dashboard →
     Authentication → Users, ban or delete the account.
   - Many fake sign-ups or a flood of requests: check that the bot check is on
     (Supabase → Authentication → Attack Protection); in Vercel → Firewall turn on
     *Attack Challenge Mode* until it stops.
   - Site broken by a deploy: Vercel → Deployments → previous deployment → **Promote
     to production** (instant rollback). Database changes are not rolled back by this.
   - Everything else fails: Dashboard → Project Settings → **Pause project** (the site
     stops; data is kept).
2. **Rotate any key that may have leaked** (section 4).
3. **Find out what happened**: Supabase Logs (API, Auth, Postgres), Vercel Logs, the
   audit log (`select * from public.admin_audit_log(200)` as an admin, or
   `select * from public.audit_log order by id desc limit 200;` in the SQL editor).
4. **Restore** lost data from the latest backup into a scratch project and copy back
   only the rows that are missing. Never restore over production blindly.
5. **Tell the people affected** what happened, what data was involved and what they
   should do (for example, change their password). Be specific and quick.
6. **Write it down** (date, cause, impact, fix, what changes so it cannot happen again)
   in the project notes.

## 4. Keys and secrets

| Secret | Lives in | If it leaks |
|---|---|---|
| Supabase anon/publishable key | Vercel env, the browser | Public by design; RLS protects data. Rotate only if abused (Dashboard → API keys). |
| Supabase secret key (`sb_secret_…`, the `backup` key) | Only `.env.backup` on your PC | Delete it at once (Dashboard → API Keys) and create a new one. Never in Vercel, git or any `NEXT_PUBLIC_*` variable. |
| Legacy `anon` / `service_role` keys | Nowhere (the app uses the new keys) | Disable the legacy keys (Dashboard → API Keys). |
| Turnstile site key | Vercel env, the browser | Public by design. |
| Turnstile secret key | Only Supabase → Authentication → Attack Protection | Cloudflare → Turnstile → the widget → rotate the secret key, then paste the new one into Supabase at once. |
| Database password | Your password manager | Dashboard → Database → reset password. |
| ORCID client secret | Supabase Vault (`orcid_client_secret`) | Regenerate it in ORCID developer tools, then `vault.update_secret` (see `supabase/README.md`). |
| Gemini / Anthropic API key | Vercel env (Sensitive) | Revoke in the provider's console, create a new one, update Vercel, redeploy. |

If the legacy JWT secret leaks: Dashboard → Project Settings → **JWT Keys** → *Rotate
keys* (if not done yet), disable the legacy API keys (API Keys), then *Revoke* the
legacy secret; tokens signed with it stop working. The private half of the new signing
keys never leaves Supabase.

Recommended Auth settings (Secure password change, the bot check, JWT signing keys) are
in `supabase/README.md`.

## 5. Admin tasks

- **Add or remove an admin**: SQL in `supabase/README.md` (written to the audit log).
- **Someone asks for their data or for deletion by email**: they can do both from their
  profile page ("Download my data", "Delete my account"). If they cannot log in, verify
  it is really them, then in the SQL editor delete their posts first
  (`delete from public.contents where user_id = '<their id>';`) and delete the user in
  Dashboard → Authentication → Users; remove their files in Storage.
- **A post must go**: `/admin` → reported posts → Remove post (the author is told why,
  and its files are deleted). For a post nobody reported yet, report it yourself from
  the post's menu first; it then appears in the queue.
- **Leftover chat files**: when a chat disappears (an account or a post it belonged to
  was deleted), the files the *other* person sent in it stay in storage. Nobody can
  open them (only people in the chat can, and the chat is gone), but they still take
  space and count as that person's files. List them in the SQL editor:

  ```sql
  select o.name, o.created_at
  from storage.objects o
  where o.bucket_id = 'chat-attachments'
    and not exists (select 1 from public.conversations c
                    where c.id = public.conversation_id_from_path(o.name));
  ```

  Then delete those folders in Dashboard → Storage → `chat-attachments` (the first
  part of each path is the old chat's id).

## 6. Accounts and the firewall

### Two-factor sign-in (all accounts that can change production)

Anyone who gets into one of these accounts controls the site, so each needs an
authenticator app (not SMS):

| Account | Where | Note |
|---|---|---|
| Supabase | <https://supabase.com/dashboard/account/security> | There are no recovery codes: add a second authenticator (another phone or a password manager) as a backup. |
| Vercel | <https://vercel.com/account/settings/authentication#two-factor-authentication> | Save the recovery codes offline. |
| GitHub | <https://github.com/settings/security> | Save the recovery codes offline. |
| Cloudflare | My Profile → Authentication | Holds the Turnstile keys (and the domain later). |
| The contact Gmail | Google Account → Security → 2-Step Verification | People write to it about their data. |

### Vercel Firewall (Hobby plan)

Vercel → the project → **Firewall**:

- **Bot Protection** (managed rule): start in *Log*; after a week, if the log shows
  only real bots, switch to *Challenge*. Verified bots (search engines, link
  previews) are let through either way.
- **One rate-limit rule** (Hobby allows one): requests whose path starts with `/api/`,
  fixed window of 60 seconds, 100 requests per IP address, action *Too Many Requests*.
  A whole campus can share one IP address; if students there see errors, raise the
  number. The research assistant also has its own per-person limit.
- **Attack Challenge Mode**: only during an attack (section 3).
