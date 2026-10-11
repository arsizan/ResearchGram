-- ResearchGram emergency lock-down, 11 Oct 2026 (Sydney project).
-- Safe for the current app: every page needs login, so the anon key never needs table access.

-- 1. Logged-out callers (the public anon key) lose all access to every table.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- 2. RLS on for the 8 workspace tables. Their policies already exist.
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_tasks enable row level security;
alter table public.workspace_files enable row level security;
alter table public.workspace_milestones enable row level security;
alter table public.workspace_meetings enable row level security;
alter table public.workspace_recordings enable row level security;
alter table public.workspace_updates enable row level security;

-- 3. Storage: nobody can list every file any more; uploads only into your own folder.
--    Public file links keep working (the buckets stay public).
drop policy if exists "allow public read from content-files" on storage.objects;
drop policy if exists "allow public read from content-images" on storage.objects;
drop policy if exists "new2 80b85y_0" on storage.objects;
drop policy if exists "allow authenticated upload to content-files" on storage.objects;
drop policy if exists "allow authenticated upload to content-images" on storage.objects;
drop policy if exists "new1 80b85y_0" on storage.objects;

create policy "content-files: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content-files' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "content-files: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "profile-avatars: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile-avatars: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
