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
- Keep the last 4 weekly dumps; delete older ones.
- Never paste the connection string (it contains the password) anywhere else.

### Stored files

A database dump does not contain the files in Storage (avatars, papers, workspace and
chat files). `scripts/migrateToMumbai.mjs` copies every bucket from one project to
another; pointed at a scratch project, it doubles as a file backup. Do it monthly.

### Restore test (every 3 months)

A backup that was never restored is a hope, not a backup. Create a scratch Supabase
project, run `pg_restore --dbname "SCRATCH-CONNECTION-STRING" --no-owner --clean --if-exists "D:\...\rg-latest.dump"`,
and open a few tables. Then delete the scratch project.

## 2. Regular checks

| How often | What |
|---|---|
| Weekly | Admin console (`/admin`): open reports, and the audit log for anything unexpected (admin changes, many account deletions, paper-access decisions). |
| Weekly | Supabase Dashboard → **Advisors** (Security and Performance). Fix every security warning. |
| Weekly | Database dump (above). |
| Every push | GitHub Actions: lint, types, build, database tests, browser tests, dependency audit. Do not deploy a red build. |
| Monthly | `npm outdated` and `npm audit`; apply security updates (Next.js, Supabase libraries). |
| Monthly | Vercel → Logs and Supabase → Logs: repeated errors, unusual traffic. |
| Monthly | Leftover chat files (section 5). |

## 3. Incidents

An incident is anything that exposes or loses data, or takes the site down: a leaked key,
data visible to the wrong people, spam or abuse at scale, data deleted by mistake.

1. **Contain first.**
   - Data exposed by a rule: run the matching undo/off switch from `supabase/README.md`,
     or temporarily revoke the grant, then fix properly.
   - Abuse from one account: remove its posts from `/admin`; in Dashboard →
     Authentication → Users, ban or delete the account.
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
| Supabase service-role/secret key | Only `.env.migrate` on your PC, while a script runs | Rotate immediately (Dashboard → API keys). Never in Vercel, git or any `NEXT_PUBLIC_*` variable. |
| Database password | Your password manager | Dashboard → Database → reset password. |
| ORCID client secret | Supabase Vault (`orcid_client_secret`) | Regenerate it in ORCID developer tools, then `vault.update_secret` (see `supabase/README.md`). |
| Gemini / Anthropic API key | Vercel env (Sensitive) | Revoke in the provider's console, create a new one, update Vercel, redeploy. |

Signing every user out (for example after a JWT secret leak): Dashboard → Project
Settings → JWT keys → rotate. All sessions end; people log in again.

Recommended Auth settings (Secure password change, JWT signing keys) are in
`supabase/README.md` → *Auth settings*.

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
