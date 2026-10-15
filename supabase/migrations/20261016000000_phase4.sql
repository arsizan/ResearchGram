-- Phase 4: admin console and moderation, audit log, data export and account
-- deletion, ORCID ownership, chat attachments and voice notes, mute, and
-- all-or-nothing database functions for multi-step writes (audit RG-20, RG-22).
--
-- Run this BEFORE deploying the Phase 4 code. The Phase 3 code keeps working
-- with it. Safe to run more than once.
--
-- Make someone an admin (SQL editor, after they have signed up):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'person@example.com'
--   on conflict do nothing;

-- ============================================================================
-- 1. Admins and the audit log
-- ============================================================================

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);

alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated;
grant all on table public.admins to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Who did what. Rows are written only by database functions and triggers;
-- admins read them through admin_audit_log(). No message text or file contents
-- are stored here.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;
grant all on table public.audit_log to service_role;

create or replace function public.write_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

revoke all on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.write_audit(text, text, text, jsonb) to service_role;

create or replace function public.audit_admins_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('admin.added', 'user', new.user_id::text, '{}'::jsonb);
    return new;
  end if;
  perform public.write_audit('admin.removed', 'user', old.user_id::text, '{}'::jsonb);
  return old;
end;
$$;

drop trigger if exists admins_audit on public.admins;
create trigger admins_audit
  after insert or delete on public.admins
  for each row execute function public.audit_admins_change();

-- Access to a restricted paper was granted or refused.
create or replace function public.audit_paper_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform public.write_audit(
      'paper_access.' || new.status,
      'paper_access_request',
      new.id::text,
      jsonb_build_object('content_id', new.content_id, 'requester_id', new.requester_id, 'owner_id', new.owner_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists paper_access_requests_audit on public.paper_access_requests;
create trigger paper_access_requests_audit
  after update of status on public.paper_access_requests
  for each row execute function public.audit_paper_access_change();

-- Someone gained or lost access to a workspace (and its private files).
create or replace function public.audit_workspace_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.role <> 'owner' then
      perform public.write_audit(
        'workspace.member_added', 'workspace', new.workspace_id::text,
        jsonb_build_object('user_id', new.user_id, 'role', new.role)
      );
    end if;
    return new;
  end if;

  -- Rows removed because the workspace or the account is being deleted are not logged.
  if exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and exists (select 1 from public.profiles p where p.id = old.user_id) then
    perform public.write_audit(
      'workspace.member_removed', 'workspace', old.workspace_id::text,
      jsonb_build_object('user_id', old.user_id, 'role', old.role)
    );
  end if;
  return old;
end;
$$;

drop trigger if exists workspace_members_audit on public.workspace_members;
create trigger workspace_members_audit
  after insert or delete on public.workspace_members
  for each row execute function public.audit_workspace_member_change();

revoke all on function public.audit_admins_change() from public, anon, authenticated;
revoke all on function public.audit_paper_access_change() from public, anon, authenticated;
revoke all on function public.audit_workspace_member_change() from public, anon, authenticated;

-- One timestamp per person and action, for "not more than once per minute" rules.
create table if not exists public.action_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  last_at timestamptz not null default now(),
  primary key (user_id, action)
);

alter table public.action_rate_limits enable row level security;
revoke all on table public.action_rate_limits from anon, authenticated;
grant all on table public.action_rate_limits to service_role;

-- True (and the time is recorded) when the caller did not do this within p_every.
create or replace function public.take_rate_limit(p_action text, p_every interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  allowed boolean;
begin
  if me is null then
    return false;
  end if;

  insert into public.action_rate_limits as l (user_id, action, last_at)
  values (me, p_action, now())
  on conflict (user_id, action) do update
    set last_at = now()
    where l.last_at <= now() - p_every
  returning true into allowed;

  return coalesce(allowed, false);
end;
$$;

revoke all on function public.take_rate_limit(text, interval) from public, anon, authenticated;

-- ============================================================================
-- 2. Moderation
-- ============================================================================

alter table public.post_reports add column if not exists resolved_at timestamptz;
alter table public.post_reports add column if not exists resolved_by uuid references public.profiles (id) on delete set null;
alter table public.post_reports add column if not exists resolution_note text;

-- A report is about a post the reporter can see, and starts as pending. Only
-- the reason and details can be edited afterwards; admins set the outcome.
drop policy if exists "users can create their own post reports" on public.post_reports;
drop policy if exists "post reports: report a visible post" on public.post_reports;
create policy "post reports: report a visible post"
  on public.post_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and resolved_at is null
    and resolved_by is null
    and resolution_note is null
    and exists (
      select 1 from public.contents c
      where c.id = post_reports.content_id
        and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))
    )
  );

revoke update, delete on table public.post_reports from authenticated;
grant update (reason, details, updated_at) on table public.post_reports to authenticated;

-- Reporters see their own reports, but not which admin handled them or the
-- admin's note.
revoke select on table public.post_reports from authenticated;
grant select (id, content_id, reporter_id, reason, details, status, created_at, updated_at)
  on table public.post_reports to authenticated;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can do this.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.require_admin() from public, anon, authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'posts', (select count(*) from public.contents),
    'posts_7d', (select count(*) from public.contents c where c.created_at > now() - interval '7 days'),
    'messages_7d', (select count(*) from public.messages m where m.created_at > now() - interval '7 days'),
    'pending_reports', (select count(*) from public.post_reports r where r.status = 'pending'),
    'reported_posts', (select count(distinct r.content_id) from public.post_reports r where r.status = 'pending'),
    'admins', (select count(*) from public.admins)
  );
end;
$$;

-- Reported posts, one row per post. 'pending' = open reports; 'resolved' =
-- dismissed or reviewed ones (reports on removed posts go with the post; the
-- audit log keeps the record).
create or replace function public.admin_report_queue(
  p_status text default 'pending',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  content_id uuid,
  post_title text,
  post_excerpt text,
  post_author_id uuid,
  post_author_name text,
  post_visibility text,
  post_created_at timestamptz,
  report_count bigint,
  reasons text[],
  details text[],
  first_reported_at timestamptz,
  last_reported_at timestamptz,
  resolved_at timestamptz,
  resolution_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  if p_status not in ('pending', 'resolved') then
    raise exception 'Unknown report status.' using errcode = 'P0001';
  end if;

  return query
  select
    c.id,
    c.title,
    left(coalesce(nullif(btrim(c.abstract), ''), c.content, ''), 400),
    c.user_id,
    p.full_name,
    coalesce(c.visibility_mode, 'public'),
    c.created_at,
    count(r.id),
    array_agg(distinct r.reason),
    coalesce(array_agg(left(r.details, 500) order by r.created_at) filter (where nullif(btrim(r.details), '') is not null), array[]::text[]),
    min(r.created_at),
    max(r.created_at),
    max(r.resolved_at),
    (array_agg(r.resolution_note order by r.resolved_at desc nulls last))[1]
  from public.post_reports r
  join public.contents c on c.id = r.content_id
  left join public.profiles p on p.id = c.user_id
  where (p_status = 'pending' and r.status = 'pending')
     or (p_status = 'resolved' and r.status <> 'pending')
  group by c.id, p.full_name
  order by max(r.created_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Close a post's open reports without removing it.
create or replace function public.admin_dismiss_reports(p_content_id uuid, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  perform public.require_admin();

  update public.post_reports r
     set status = 'dismissed',
         resolved_at = now(),
         resolved_by = (select auth.uid()),
         resolution_note = nullif(btrim(coalesce(p_note, '')), ''),
         updated_at = now()
   where r.content_id = p_content_id
     and r.status = 'pending';

  get diagnostics closed = row_count;

  if closed = 0 then
    raise exception 'This post has no open reports.' using errcode = 'P0002';
  end if;

  perform public.write_audit(
    'reports.dismissed', 'post', p_content_id::text,
    jsonb_build_object('reports', closed, 'note', left(nullif(btrim(coalesce(p_note, '')), ''), 500))
  );

  return closed;
end;
$$;

-- Remove a post (with its comments, attachments and reports) and tell the
-- author why. Returns the storage files to delete: {"files":[{"bucket","path"}]}.
create or replace function public.admin_remove_post(p_content_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  post record;
  files jsonb;
  report_total integer;
  reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  perform public.require_admin();

  if reason = '' then
    raise exception 'Give a reason. The author will see it.' using errcode = 'P0001';
  end if;

  select c.id, c.title, c.user_id into post
  from public.contents c
  where c.id = p_content_id
  for update;

  if not found then
    raise exception 'This post no longer exists.' using errcode = 'P0002';
  end if;

  -- Only files of the post's author (in their folder, or uploaded by them): a
  -- post can name any path, and must not get someone else's file deleted.
  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name) order by o.bucket_id, o.name), '[]'::jsonb)
    into files
  from storage.objects o
  where o.bucket_id in ('content-files', 'restricted-papers', 'content-images')
    and o.name in (
      select a.storage_path from public.content_attachments a
       where a.content_id = p_content_id and coalesce(a.storage_path, '') <> ''
      union
      select i.storage_path from public.paper_extracted_images i
       where i.content_id = p_content_id and coalesce(i.storage_path, '') <> ''
    )
    and (
      (storage.foldername(o.name))[2] = post.user_id::text
      or o.owner_id = post.user_id::text
      or o.owner = post.user_id
    );

  select count(*) into report_total from public.post_reports r where r.content_id = p_content_id;

  delete from public.contents c where c.id = p_content_id;

  insert into public.notifications (recipient_id, actor_id, notification_type, title, body, metadata)
  values (
    post.user_id,
    null,
    'system',
    'A moderator removed your post',
    'Your post "' || left(coalesce(nullif(btrim(post.title), ''), 'Untitled'), 120) || '" was removed. Reason: ' || reason,
    jsonb_build_object('removed_content_id', p_content_id)
  );

  perform public.write_audit(
    'post.removed', 'post', p_content_id::text,
    jsonb_build_object('title', left(post.title, 200), 'author_id', post.user_id, 'reason', reason, 'reports', report_total)
  );

  return jsonb_build_object('files', files);
end;
$$;

create or replace function public.admin_audit_log(p_limit integer default 50, p_before bigint default null)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  action text,
  target_type text,
  target_id text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  return query
  select l.id, l.occurred_at, l.actor_id, p.full_name, l.action, l.target_type, l.target_id, l.details
  from public.audit_log l
  left join public.profiles p on p.id = l.actor_id
  where p_before is null or l.id < p_before
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_report_queue(text, integer, integer) from public, anon;
revoke all on function public.admin_dismiss_reports(uuid, text) from public, anon;
revoke all on function public.admin_remove_post(uuid, text) from public, anon;
revoke all on function public.admin_audit_log(integer, bigint) from public, anon;
grant execute on function public.admin_overview() to authenticated, service_role;
grant execute on function public.admin_report_queue(text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_dismiss_reports(uuid, text) to authenticated, service_role;
grant execute on function public.admin_remove_post(uuid, text) to authenticated, service_role;
grant execute on function public.admin_audit_log(integer, bigint) to authenticated, service_role;

-- ============================================================================
-- 3. Storage: delete rules, and the private bucket for chat attachments
-- ============================================================================

-- First folder of a chat attachment path as a conversation id; null when it is not a uuid.
create or replace function public.conversation_id_from_path(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(object_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.conversation_id_from_path(text) from public, anon;
grant execute on function public.conversation_id_from_path(text) to authenticated, service_role;

-- False for the chat of a collaboration request that was declined: nothing new
-- can be sent there.
create or replace function public.conversation_is_open(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.conversations c
    join public.research_requests r on r.id = c.request_id
    where c.id = target_conversation_id
      and r.status not in ('pending', 'accepted')
  );
$$;

revoke all on function public.conversation_is_open(uuid) from public, anon;
grant execute on function public.conversation_is_open(uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400,  -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'application/json',
    'text/csv',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/octet-stream',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/aac'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path: {conversation_id}/{user_id}/{file}. Only people in the chat can read it.
drop policy if exists "chat-attachments: members read" on storage.objects;
create policy "chat-attachments: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(public.conversation_id_from_path(name))
  );

drop policy if exists "chat-attachments: members upload to own folder" on storage.objects;
create policy "chat-attachments: members upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_conversation_member(public.conversation_id_from_path(name))
    and public.conversation_is_open(public.conversation_id_from_path(name))
  );

drop policy if exists "chat-attachments: uploader deletes" on storage.objects;
create policy "chat-attachments: uploader deletes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- People can see and delete their own files (needed for account deletion and
-- for cleaning up after a failed post). Deleting needs both: storage deletes
-- only rows the person can also read.
drop policy if exists "storage: uploader reads own files" on storage.objects;
create policy "storage: uploader reads own files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('content-files', 'restricted-papers', 'profile-avatars', 'workspace-files', 'chat-attachments', 'content-images')
    and (
      owner_id = (select auth.uid())::text
      or owner = (select auth.uid())
      or (bucket_id in ('content-files', 'restricted-papers', 'workspace-files', 'chat-attachments')
          and (storage.foldername(name))[2] = (select auth.uid())::text)
      or (bucket_id = 'profile-avatars'
          and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );

drop policy if exists "content-files: delete own folder" on storage.objects;
create policy "content-files: delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'content-files'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "profile-avatars: delete own folder" on storage.objects;
create policy "profile-avatars: delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "storage: uploader deletes own files" on storage.objects;
create policy "storage: uploader deletes own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('content-files', 'restricted-papers', 'profile-avatars', 'workspace-files', 'chat-attachments', 'content-images')
    and (owner_id = (select auth.uid())::text or owner = (select auth.uid()))
  );

-- Admins see and remove the files of posts (to review a report, and to delete
-- the files of a post they removed).
drop policy if exists "admins read post files" on storage.objects;
create policy "admins read post files"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('content-files', 'restricted-papers', 'content-images')
    and (select public.is_admin())
  );

drop policy if exists "admins delete post files" on storage.objects;
create policy "admins delete post files"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('content-files', 'restricted-papers', 'content-images')
    and (select public.is_admin())
  );

-- A restricted paper is readable by its author, and by people whose access
-- request for the author's post was approved. Before, any post could list any
-- path as its attachment, so approving a request on your own post could open
-- someone else's paper. Now the file must be in the post author's own folder.
drop policy if exists "restricted papers owner or approved requester can read" on storage.objects;
create policy "restricted papers owner or approved requester can read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'restricted-papers'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or exists (
        select 1
        from public.content_attachments ca
        join public.contents c on c.id = ca.content_id
        join public.paper_access_requests par on par.content_id = ca.content_id
        where ca.storage_path = objects.name
          and ca.bucket_name = 'restricted-papers'
          and (storage.foldername(objects.name))[2] = c.user_id::text
          and par.owner_id = c.user_id
          and par.requester_id = (select auth.uid())
          and par.status = 'approved'
      )
    )
  );

-- A post's files: the post author may only list files from their own upload
-- folder for that post (uploads/{author}/{post}/...), in the post buckets.
drop policy if exists "attachments: post author writes" on public.content_attachments;
create policy "attachments: post author writes"
  on public.content_attachments for all to authenticated
  using (
    exists (select 1 from public.contents c
            where c.id = content_attachments.content_id and c.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.contents c
            where c.id = content_attachments.content_id and c.user_id = (select auth.uid()))
    and storage_path like 'uploads/' || (select auth.uid())::text || '/' || content_id::text || '/%'
    and coalesce(bucket_name, 'content-files') in ('content-files', 'restricted-papers')
  );

-- ============================================================================
-- 4. Data export and account deletion
-- ============================================================================

-- Every stored file that belongs to the caller: own uploads, plus files in
-- workspaces they own.
create or replace function public.my_storage_objects()
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where (select auth.uid()) is not null
    and o.bucket_id in ('content-files', 'restricted-papers', 'profile-avatars', 'workspace-files', 'chat-attachments', 'content-images')
    and (
      o.owner = (select auth.uid())
      or o.owner_id = (select auth.uid())::text
      or (o.bucket_id in ('content-files', 'restricted-papers', 'workspace-files', 'chat-attachments')
          and (storage.foldername(o.name))[2] = (select auth.uid())::text)
      or (o.bucket_id = 'profile-avatars'
          and (storage.foldername(o.name))[1] = (select auth.uid())::text)
      or (o.bucket_id = 'workspace-files'
          and exists (
            select 1 from public.workspaces w
            where w.id = public.workspace_id_from_path(o.name)
              and w.owner_id = (select auth.uid())
          ))
    )
  order by o.bucket_id, o.name;
$$;

revoke all on function public.my_storage_objects() from public, anon;
grant execute on function public.my_storage_objects() to authenticated, service_role;

-- Everything ResearchGram stores about the caller, as one JSON document.
-- Messages: the ones the caller sent (other people's messages are theirs).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result jsonb;
begin
  if me is null then
    raise exception 'Sign in to download your data.' using errcode = 'P0001';
  end if;

  if not public.take_rate_limit('export_my_data', interval '1 minute') then
    raise exception 'You downloaded your data a moment ago. Try again in a minute.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'format', 'researchgram-export-1',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'posts', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
                       from public.contents c where c.user_id = me), '[]'::jsonb),
    'post_attachments', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
                                  from public.content_attachments a
                                  join public.contents c on c.id = a.content_id
                                  where c.user_id = me), '[]'::jsonb),
    'post_authors', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                              from public.content_authors x
                              where x.profile_id = me
                                 or exists (select 1 from public.contents c where c.id = x.content_id and c.user_id = me)), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                          from public.comments x where x.user_id = me), '[]'::jsonb),
    'saved_posts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                             from public.saved_posts x where x.user_id = me), '[]'::jsonb),
    'hidden_posts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                              from public.hidden_posts x where x.user_id = me), '[]'::jsonb),
    'post_reports', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', x.id, 'content_id', x.content_id, 'reason', x.reason,
                                  'details', x.details, 'status', x.status,
                                  'created_at', x.created_at, 'updated_at', x.updated_at)
                                  order by x.created_at)
                              from public.post_reports x where x.reporter_id = me), '[]'::jsonb),
    'research_requests', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                   from public.research_requests x
                                   where me in (x.requester_id, x.receiver_id)), '[]'::jsonb),
    'profile_requests', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                  from public.profile_requests x
                                  where me in (x.requester_id, x.receiver_id)), '[]'::jsonb),
    'paper_access_requests', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                       from public.paper_access_requests x
                                       where me in (x.requester_id, x.owner_id)), '[]'::jsonb),
    'connections', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                             from public.user_connections x
                             where me in (x.user_one_id, x.user_two_id)), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', c.id, 'type', c.conversation_type, 'title', c.title,
                                  'workspace_id', c.workspace_id, 'content_id', c.content_id,
                                  'created_at', c.created_at, 'joined_at', m.joined_at, 'muted', m.muted)
                                  order by c.created_at)
                               from public.conversation_members m
                               join public.conversations c on c.id = m.conversation_id
                               where m.user_id = me), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object(
                                  'id', x.id, 'conversation_id', x.conversation_id,
                                  'text', coalesce(x.body, x.message_text), 'created_at', x.created_at,
                                  'deleted', x.is_deleted, 'attachment_name', x.attachment_name,
                                  'attachment_kind', x.attachment_kind, 'attachment_path', x.attachment_path)
                                  order by x.created_at)
                               from public.messages x where x.sender_id = me), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                               from public.notifications x where x.recipient_id = me), '[]'::jsonb),
    'workspaces_owned', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                  from public.workspaces x where x.owner_id = me), '[]'::jsonb),
    'workspace_memberships', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                       from public.workspace_members x where x.user_id = me), '[]'::jsonb),
    -- Tasks and milestones are edited by the whole team: only from workspaces
    -- the caller still belongs to.
    'workspace_tasks', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                 from public.workspace_tasks x
                                 where me in (x.created_by, x.assigned_to)
                                   and (public.is_workspace_member(x.workspace_id)
                                        or public.is_workspace_owner(x.workspace_id))), '[]'::jsonb),
    'workspace_milestones', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                      from public.workspace_milestones x
                                      where x.created_by = me
                                        and (public.is_workspace_member(x.workspace_id)
                                             or public.is_workspace_owner(x.workspace_id))), '[]'::jsonb),
    'workspace_updates', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                   from public.workspace_updates x where x.author_id = me), '[]'::jsonb),
    'workspace_files', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                 from public.workspace_files x where x.uploaded_by = me), '[]'::jsonb),
    'workspace_meetings', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                    from public.workspace_meetings x where x.created_by = me), '[]'::jsonb),
    'workspace_recordings', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                      from public.workspace_recordings x where x.recorded_by = me), '[]'::jsonb),
    'search_history', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                from public.search_events x where x.user_id = me), '[]'::jsonb),
    'profiles_viewed', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at)
                                 from public.profile_view_events x where x.viewer_id = me), '[]'::jsonb),
    'stored_files', coalesce((select jsonb_agg(jsonb_build_object('bucket', f.bucket_id, 'path', f.name))
                              from public.my_storage_objects() f), '[]'::jsonb)
  ) into result;

  perform public.write_audit('account.exported', 'user', me::text, '{}'::jsonb);

  return result;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated, service_role;

-- Deletes the caller's account and everything that belongs to it. The app first
-- deletes the caller's files through the Storage API (my_storage_objects());
-- the database cannot remove stored files itself.
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  stats jsonb;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  if coalesce(p_confirm, '') <> 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = 'P0001';
  end if;

  -- A sign-in token stays valid for a while after the account is gone.
  if not exists (select 1 from auth.users u where u.id = me) then
    raise exception 'This account was already deleted.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.my_storage_objects()) then
    raise exception 'Some of your files could not be deleted yet. Try again.' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'posts', (select count(*) from public.contents c where c.user_id = me),
    'workspaces_owned', (select count(*) from public.workspaces w where w.owner_id = me),
    'messages', (select count(*) from public.messages m where m.sender_id = me)
  ) into stats;

  -- Co-author entries on other people's posts keep the name instead of the link.
  update public.content_authors x
     set manual_name = coalesce(
           nullif(btrim(x.manual_name), ''),
           (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = me),
           'Former ResearchGram member')
   where x.profile_id = me;

  -- Posts do not follow the profile automatically.
  delete from public.contents c where c.user_id = me;

  begin
    -- The profile, and everything else that belongs to it, follows the login.
    delete from auth.users u where u.id = me;
  exception when insufficient_privilege then
    raise exception 'Account deletion is not available yet. Please contact the ResearchGram team.' using errcode = 'P0001';
  end;

  delete from public.profiles p where p.id = me;

  perform public.write_audit('account.deleted', 'user', me::text, stats);
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated, service_role;

-- ============================================================================
-- 5. ORCID: prove the iD is yours
-- ============================================================================

alter table public.profiles add column if not exists orcid_verified_at timestamptz;

-- The browser cannot mark an iD as verified. Changing the iD removes the
-- verification and the numbers that belonged to the old iD.
create or replace function public.profiles_orcid_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.orcid_verified_at := null;
    end if;
    return new;
  end if;

  if new.orcid_id is distinct from old.orcid_id then
    if current_user = 'authenticated'
       or new.orcid_verified_at is not distinct from old.orcid_verified_at then
      new.orcid_verified_at := null;
    end if;

    if current_user = 'authenticated' then
      new.external_publication_count := 0;
      new.external_citation_count := 0;
      new.external_h_index := 0;
      new.external_metrics_synced_at := null;
    end if;
  elsif current_user = 'authenticated' then
    new.orcid_verified_at := old.orcid_verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_orcid_verification on public.profiles;
create trigger profiles_orcid_verification
  before insert or update on public.profiles
  for each row execute function public.profiles_orcid_verification();

revoke all on function public.profiles_orcid_verification() from public, anon, authenticated;

-- One account per verified iD.
create unique index if not exists profiles_verified_orcid_unique
  on public.profiles (orcid_id)
  where orcid_verified_at is not null;

-- ORCID app settings live in Vault (Project Settings -> Vault):
--   orcid_client_id, orcid_client_secret, and optionally
--   orcid_base_url = https://sandbox.orcid.org for testing.
create or replace function public.orcid_setting(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  setting text;
begin
  begin
    select s.decrypted_secret into setting
    from vault.decrypted_secrets s
    where s.name = p_name
    order by s.created_at desc
    limit 1;
  exception when undefined_table or invalid_schema_name or insufficient_privilege then
    return null;
  end;

  return nullif(btrim(setting), '');
end;
$$;

revoke all on function public.orcid_setting(text) from public, anon, authenticated;

-- The app sends the code from ORCID's sign-in page; the database exchanges it
-- with ORCID (with the secret only the database knows) and stores the iD ORCID
-- confirms. No ORCID tokens are kept.
--
-- Once ORCID has been asked, a failure comes back as `problem` instead of an
-- error: an error would also undo the rate-limit record, and every retry could
-- then call ORCID with the app's secret again.
drop function if exists public.verify_orcid(text, text);
create function public.verify_orcid(p_code text, p_redirect_uri text)
returns table (orcid_id text, verified_at timestamptz, problem text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  client_id text := public.orcid_setting('orcid_client_id');
  client_secret text := public.orcid_setting('orcid_client_secret');
  base_url text := coalesce(public.orcid_setting('orcid_base_url'), 'https://orcid.org');
  response extensions.http_response;
  answer jsonb;
  confirmed text;
  saved record;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  if client_id is null or client_secret is null then
    raise exception 'ORCID sign-in is not set up yet.' using errcode = 'P0001';
  end if;

  if base_url not in ('https://orcid.org', 'https://sandbox.orcid.org') then
    raise exception 'ORCID sign-in is not set up correctly.' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_code), '') = '' or length(p_code) > 200 then
    raise exception 'The ORCID sign-in did not finish. Try again.' using errcode = 'P0001';
  end if;

  if coalesce(p_redirect_uri, '') !~ '^https?://[^/?#]+/' or length(p_redirect_uri) > 500 then
    raise exception 'The ORCID sign-in did not finish. Try again.' using errcode = 'P0001';
  end if;

  if not public.take_rate_limit('verify_orcid', interval '10 seconds') then
    raise exception 'Wait a few seconds and try again.' using errcode = 'P0001';
  end if;

  -- Well inside the 8-second limit on a signed-in user's request.
  perform set_config('http.timeout_msec', '4000', true);
  begin
    response := extensions.http((
      'POST',
      base_url || '/oauth/token',
      array[row('Accept', 'application/json')::extensions.http_header],
      'application/x-www-form-urlencoded',
      'client_id=' || extensions.urlencode(client_id)
        || '&client_secret=' || extensions.urlencode(client_secret)
        || '&grant_type=authorization_code'
        || '&code=' || extensions.urlencode(btrim(p_code))
        || '&redirect_uri=' || extensions.urlencode(p_redirect_uri)
    )::extensions.http_request);
  exception when others then
    return query select null::text, null::timestamptz, 'ORCID did not answer. Start again from your profile in a minute.'::text;
    return;
  end;

  if response.status is distinct from 200 then
    return query select null::text, null::timestamptz, 'ORCID did not confirm the sign-in. Start again from your profile.'::text;
    return;
  end if;

  begin
    answer := response.content::jsonb;
  exception when others then
    answer := null;
  end;

  confirmed := upper(btrim(coalesce(answer ->> 'orcid', '')));

  if confirmed !~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$' then
    return query select null::text, null::timestamptz, 'ORCID sent an answer ResearchGram could not read.'::text;
    return;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.orcid_id = confirmed and p.orcid_verified_at is not null and p.id <> me
  ) then
    return query select null::text, null::timestamptz, 'This ORCID iD is already verified on another ResearchGram account.'::text;
    return;
  end if;

  begin
    update public.profiles p
       set external_publication_count = case when p.orcid_id is distinct from confirmed then 0 else p.external_publication_count end,
           external_citation_count = case when p.orcid_id is distinct from confirmed then 0 else p.external_citation_count end,
           external_h_index = case when p.orcid_id is distinct from confirmed then 0 else p.external_h_index end,
           external_metrics_synced_at = case when p.orcid_id is distinct from confirmed then null else p.external_metrics_synced_at end,
           orcid_id = confirmed,
           orcid_verified_at = now(),
           updated_at = now()
     where p.id = me
    returning p.orcid_id, p.orcid_verified_at into saved;
  exception when unique_violation then
    -- Someone else verified the same iD at the same moment.
    return query select null::text, null::timestamptz, 'This ORCID iD is already verified on another ResearchGram account.'::text;
    return;
  end;

  if saved is null then
    return query select null::text, null::timestamptz, 'Your profile was not found.'::text;
    return;
  end if;

  perform public.write_audit('orcid.verified', 'user', me::text, jsonb_build_object('orcid', confirmed));

  return query select saved.orcid_id, saved.orcid_verified_at, null::text;
end;
$$;

revoke all on function public.verify_orcid(text, text) from public, anon;
grant execute on function public.verify_orcid(text, text) to authenticated, service_role;

-- Same as Phase 3, plus: once ORCID sign-in is set up, numbers are only
-- fetched for the iD the person verified; failed attempts count towards the
-- once-per-30-seconds limit and return no row.
create or replace function public.sync_my_research_metrics(orcid text)
returns table (
  orcid_id text,
  publication_count integer,
  citation_count integer,
  h_index integer,
  synced_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  clean_orcid text := upper(btrim(coalesce(orcid, '')));
  last_sync timestamptz;
  my_orcid text;
  my_verified_at timestamptz;
  response extensions.http_response;
  next_url text;
  author jsonb;
  saved record;
begin
  if me is null then
    raise exception 'Sign in to sync research metrics.' using errcode = 'P0001';
  end if;

  if clean_orcid !~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$' then
    raise exception 'Invalid ORCID iD. Example format: 0000-0002-1825-0097' using errcode = 'P0001';
  end if;

  select p.external_metrics_synced_at, p.orcid_id, p.orcid_verified_at
    into last_sync, my_orcid, my_verified_at
  from public.profiles p where p.id = me;

  if public.orcid_setting('orcid_client_id') is not null
     and (my_verified_at is null or upper(coalesce(my_orcid, '')) <> clean_orcid) then
    raise exception 'Verify your ORCID iD first (Sign in with ORCID on your profile).' using errcode = 'P0001';
  end if;

  -- One attempt per 30 seconds, whether it works or not. The record is kept
  -- because a failed attempt below returns no row instead of raising an error
  -- (an error would undo it). The app shows "could not sync" for no row.
  if (last_sync is not null and last_sync > now() - interval '30 seconds')
     or not public.take_rate_limit('sync_my_research_metrics', interval '30 seconds') then
    raise exception 'Metrics were synced a moment ago. Try again in a minute.' using errcode = 'P0001';
  end if;

  -- Two calls at most, well inside the 8-second limit on a signed-in user's request.
  perform set_config('http.timeout_msec', '3000', true);
  begin
    response := extensions.http(
      ('GET', 'https://api.openalex.org/authors/orcid:' || clean_orcid, null, null, null)::extensions.http_request
    );

    -- OpenAlex sends merged authors to their new id; follow that once, only within OpenAlex.
    if response.status in (301, 302, 303, 307, 308) then
      select h.value into next_url
      from unnest(response.headers) h
      where lower(h.field) = 'location'
      limit 1;

      if next_url like 'https://api.openalex.org/%' then
        response := extensions.http(('GET', next_url, null, null, null)::extensions.http_request);
      end if;
    end if;
  exception when others then
    return;  -- OpenAlex did not answer in time
  end;

  -- No OpenAlex author profile for this iD (404), or OpenAlex had a problem.
  if response.status is distinct from 200 then
    return;
  end if;

  begin
    author := response.content::jsonb;

    update public.profiles p
       set orcid_id = clean_orcid,
           external_publication_count = coalesce((author->>'works_count')::integer, 0),
           external_citation_count = coalesce((author->>'cited_by_count')::integer, 0),
           external_h_index = coalesce((author->'summary_stats'->>'h_index')::integer, 0),
           external_metrics_synced_at = now(),
           updated_at = now()
     where p.id = me
    returning p.orcid_id, p.external_publication_count, p.external_citation_count,
              p.external_h_index, p.external_metrics_synced_at
    into saved;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return;  -- an answer that is not the expected JSON
  end;

  if saved is null then
    raise exception 'Your profile was not found.' using errcode = 'P0002';
  end if;

  return query select saved.orcid_id, saved.external_publication_count,
                      saved.external_citation_count, saved.external_h_index,
                      saved.external_metrics_synced_at;
end;
$$;

revoke all on function public.sync_my_research_metrics(text) from public, anon;
grant execute on function public.sync_my_research_metrics(text) to authenticated, service_role;

-- ============================================================================
-- 6. Messages: attachments, voice notes, server-side fields, mute
-- ============================================================================

alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_size bigint;
alter table public.messages add column if not exists attachment_kind text;
alter table public.messages add column if not exists attachment_duration_seconds integer;

do $$
begin
  -- An attachment lives in the chat's folder, under the sender's own folder.
  if not exists (select 1 from pg_constraint where conname = 'messages_attachment_valid') then
    alter table public.messages
      add constraint messages_attachment_valid check (
        attachment_path is null
        or (
          attachment_kind in ('file', 'image', 'voice')
          and coalesce(btrim(attachment_name), '') <> ''
          and length(attachment_name) <= 255
          and split_part(attachment_path, '/', 1) = conversation_id::text
          and split_part(attachment_path, '/', 2) = sender_id::text
          and coalesce(attachment_size, 0) between 0 and 26214400
          and (attachment_duration_seconds is null or attachment_duration_seconds between 0 and 600)
        )
      );
  end if;
end;
$$;

-- A new message from the app has text, an attachment, or both. A trigger on
-- insert, not a check constraint: Postgres checks a constraint again on every
-- later update of a row (marking as read, or a pin removed when an account is
-- deleted), and older empty messages would then make those fail. Data moves
-- (service role) may still copy older empty messages.
alter table public.messages drop constraint if exists messages_not_empty;

create or replace function public.messages_require_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.attachment_path is null
     and coalesce(btrim(new.body), '') = ''
     and coalesce(btrim(new.message_text), '') = '' then
    raise exception 'A message needs text or an attachment.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_require_content on public.messages;
create trigger messages_require_content
  before insert on public.messages
  for each row execute function public.messages_require_content();

revoke all on function public.messages_require_content() from public, anon, authenticated;

-- An attachment must already be uploaded to this chat's folder. Nothing new
-- goes into the chat of a declined request.
drop policy if exists "messages: members send as themselves" on public.messages;
create policy "messages: members send as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
    and public.conversation_is_open(conversation_id)
    and (
      attachment_path is null
      or exists (
        select 1 from storage.objects o
        where o.bucket_id = 'chat-attachments' and o.name = messages.attachment_path
      )
    )
  );

-- The time, read state and moderation fields of a new message come from the
-- database, not from the sender's browser.
create or replace function public.messages_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_at := now();
    new.updated_at := now();
    new.read_at := null;
    new.is_deleted := false;
    new.deleted_at := null;
    new.pinned_at := null;
    new.pinned_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_server_fields on public.messages;
create trigger messages_server_fields
  before insert on public.messages
  for each row execute function public.messages_server_fields();

-- Sending a message moves its chat to the top, in the same transaction (RG-20).
-- A time in the future (browsers could write one before this phase) is not kept.
create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_at = greatest(least(coalesce(c.last_message_at, new.created_at), now()), new.created_at),
         updated_at = now()
   where c.id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

revoke all on function public.messages_server_fields() from public, anon, authenticated;
revoke all on function public.messages_touch_conversation() from public, anon, authenticated;

-- Same as before, plus: a preview for messages that only carry an attachment,
-- and whether I muted the chat (muted chats do not count in the nav badge).
drop function if exists public.my_conversation_summaries();
create function public.my_conversation_summaries()
returns table (
  conversation_id uuid,
  unread_count bigint,
  last_message_id uuid,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_read_at timestamptz,
  last_message_created_at timestamptz,
  muted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.conversation_id,
    (select count(*)
       from public.messages x
      where x.conversation_id = m.conversation_id
        and x.is_deleted = false
        and x.sender_id <> m.user_id
        and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz)) as unread_count,
    lm.id,
    lm.body,
    lm.sender_id,
    lm.read_at,
    lm.created_at,
    coalesce(m.muted, false)
  from public.conversation_members m
  left join lateral (
    select x.id,
           coalesce(
             nullif(x.body, ''),
             nullif(x.message_text, ''),
             case x.attachment_kind
               when 'voice' then 'Voice message'
               when 'image' then 'Photo: ' || x.attachment_name
               when 'file' then 'File: ' || x.attachment_name
             end
           ) as body,
           x.sender_id, x.read_at, x.created_at
      from public.messages x
     where x.conversation_id = m.conversation_id
       and x.is_deleted = false
     order by x.created_at desc
     limit 1
  ) lm on true
  where m.user_id = (select auth.uid());
$$;

revoke all on function public.my_conversation_summaries() from public, anon;
grant execute on function public.my_conversation_summaries() to authenticated, service_role;

-- Mute and read state belong to the member. The other person in a chat (or a
-- workspace owner) may update member rows, but their changes to these two are
-- ignored rather than refused, so older code that re-saves both rows still works.
create or replace function public.conversation_members_own_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.user_id is distinct from (select auth.uid()) then
    new.muted := old.muted;
    new.last_read_at := old.last_read_at;
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_members_own_settings on public.conversation_members;
create trigger conversation_members_own_settings
  before update on public.conversation_members
  for each row execute function public.conversation_members_own_settings();

revoke all on function public.conversation_members_own_settings() from public, anon, authenticated;

-- ============================================================================
-- 7. Workspace meetings: unguessable Jitsi rooms (audit RG-22)
-- ============================================================================

-- The room name is made here, so it cannot be guessed from the workspace id or
-- the time, whatever the browser sends.
create or replace function public.workspace_meetings_random_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.provider := 'jitsi';
  new.room_name := 'ResearchGram-' || replace(gen_random_uuid()::text, '-', '');
  new.meeting_url := 'https://meet.jit.si/' || new.room_name;
  return new;
end;
$$;

drop trigger if exists workspace_meetings_random_room on public.workspace_meetings;
create trigger workspace_meetings_random_room
  before insert on public.workspace_meetings
  for each row execute function public.workspace_meetings_random_room();

revoke all on function public.workspace_meetings_random_room() from public, anon, authenticated;

-- ============================================================================
-- 8. Connections decide who can be messaged or added to a workspace
-- ============================================================================

-- True when the two people are connected (a connection, or an accepted
-- profile or collaboration request). Only answers about the caller.
create or replace function public.are_connected(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select user_a is not null
     and user_b is not null
     and user_a <> user_b
     and (select auth.uid()) in (user_a, user_b)
     and (
       exists (select 1 from public.user_connections c
               where (c.user_one_id = user_a and c.user_two_id = user_b)
                  or (c.user_one_id = user_b and c.user_two_id = user_a))
       or exists (select 1 from public.profile_requests r
                  where r.status = 'accepted'
                    and ((r.requester_id = user_a and r.receiver_id = user_b)
                      or (r.requester_id = user_b and r.receiver_id = user_a)))
       or exists (select 1 from public.research_requests r
                  where r.status = 'accepted'
                    and ((r.requester_id = user_a and r.receiver_id = user_b)
                      or (r.requester_id = user_b and r.receiver_id = user_a)))
     );
$$;

revoke all on function public.are_connected(uuid, uuid) from public, anon;
grant execute on function public.are_connected(uuid, uuid) to authenticated, service_role;

drop policy if exists "workspace owners can add members" on public.workspace_members;
create policy "workspace owners can add members"
  on public.workspace_members for insert to authenticated
  with check (
    public.is_workspace_owner(workspace_id)
    and (user_id = (select auth.uid()) or public.are_connected((select auth.uid()), user_id))
  );

-- A new chat is one of three kinds, each with its own rule:
--   direct           two connected people
--   collaboration    the two people of a collaboration request: the receiver
--                    may open it while the request is pending, either of them
--                    once it is accepted
--   workspace_group  made by the workspace owner (members are added after)
drop policy if exists "conversations: participant creates" on public.conversations;
create policy "conversations: participant creates"
  on public.conversations for insert to authenticated
  with check (
    ((select auth.uid()) = participant_one_id or (select auth.uid()) = participant_two_id)
    and (created_by is null or created_by = (select auth.uid()))
    and (
      (conversation_type = 'direct'
        and request_id is null
        and workspace_id is null
        and public.are_connected(participant_one_id, participant_two_id))
      or (conversation_type = 'collaboration'
        and workspace_id is null
        and exists (
          select 1 from public.research_requests r
          where r.id = conversations.request_id
            and ((r.requester_id = conversations.participant_one_id and r.receiver_id = conversations.participant_two_id)
              or (r.requester_id = conversations.participant_two_id and r.receiver_id = conversations.participant_one_id))
            and (r.status = 'accepted'
                 or (r.status = 'pending' and r.receiver_id = (select auth.uid())))
        ))
      or (conversation_type = 'workspace_group'
        and request_id is null
        and workspace_id is not null
        and public.is_workspace_owner(workspace_id)
        and participant_one_id = (select auth.uid())
        and participant_two_id = (select auth.uid()))
    )
  );

-- ============================================================================
-- 9. Multi-step writes as single database calls (audit RG-20)
--    SECURITY INVOKER: every step runs with the caller's own permissions and
--    row level security, exactly as before. The difference is that the steps
--    succeed or fail together.
-- ============================================================================

-- The group chat of a shared workspace, with every member in it. Owner only.
create or replace function public.ensure_workspace_chat(p_workspace_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ws record;
  chat uuid;
begin
  select w.id, w.title, w.owner_id into ws
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or ws.owner_id is distinct from me then
    raise exception 'Only the workspace owner can do this.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('workspace-chat:' || p_workspace_id::text, 0));

  select c.id into chat
  from public.conversations c
  where c.workspace_id = p_workspace_id
    and c.conversation_type = 'workspace_group'
  order by c.created_at
  limit 1;

  if chat is null then
    chat := gen_random_uuid();
    insert into public.conversations (
      id, participant_one_id, participant_two_id, conversation_type, title,
      workspace_id, created_by, last_message_at, updated_at
    ) values (
      chat, me, me, 'workspace_group', 'Workspace: ' || ws.title,
      p_workspace_id, me, now(), now()
    );
  end if;

  insert into public.conversation_members (conversation_id, user_id, role, last_read_at)
  select chat, member_id, case when member_id = me then 'owner' else 'member' end, now()
  from (
    select wm.user_id as member_id from public.workspace_members wm where wm.workspace_id = p_workspace_id
    union
    select me
  ) people
  on conflict (conversation_id, user_id) do nothing;

  return chat;
end;
$$;

create or replace function public.create_workspace(
  p_title text,
  p_description text default null,
  p_research_area text default null,
  p_due_date date default null,
  p_workspace_type text default 'personal'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_id uuid := gen_random_uuid();
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Add a workspace title.' using errcode = 'P0001';
  end if;

  if coalesce(p_workspace_type, '') not in ('personal', 'shared') then
    raise exception 'Choose personal or shared.' using errcode = 'P0001';
  end if;

  insert into public.workspaces (
    id, owner_id, title, description, research_area, due_date, workspace_type, status
  ) values (
    new_id, me, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_research_area, '')), ''), p_due_date, p_workspace_type, 'active'
  );

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_id, me, 'owner');

  if p_workspace_type = 'shared' then
    perform public.ensure_workspace_chat(new_id);
  end if;

  return new_id;
end;
$$;

create or replace function public.make_workspace_shared(p_workspace_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.workspaces w
     set workspace_type = 'shared',
         updated_at = now()
   where w.id = p_workspace_id
     and w.owner_id = (select auth.uid());

  if not found then
    raise exception 'Only the workspace owner can do this.' using errcode = '42501';
  end if;

  return public.ensure_workspace_chat(p_workspace_id);
end;
$$;

create or replace function public.add_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ws record;
begin
  select w.owner_id, w.workspace_type into ws
  from public.workspaces w
  where w.id = p_workspace_id;

  if not found or ws.owner_id is distinct from me then
    raise exception 'Only the workspace owner can add members.' using errcode = '42501';
  end if;

  if ws.workspace_type <> 'shared' then
    raise exception 'Make this workspace shared first.' using errcode = 'P0001';
  end if;

  if p_user_id is null or p_user_id = me then
    raise exception 'Choose a collaborator.' using errcode = 'P0001';
  end if;

  if not public.are_connected(me, p_user_id) then
    raise exception 'You can add researchers you are connected with.' using errcode = 'P0001';
  end if;

  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, p_user_id, 'member');
  exception when unique_violation then
    raise exception 'This researcher is already a member.' using errcode = 'P0001';
  end;

  perform public.ensure_workspace_chat(p_workspace_id);
end;
$$;

create or replace function public.remove_workspace_member(p_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target record;
begin
  select wm.workspace_id, wm.user_id, wm.role, w.owner_id into target
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.id = p_member_id;

  if not found or target.owner_id is distinct from me then
    raise exception 'Only the workspace owner can remove members.' using errcode = '42501';
  end if;

  if target.role = 'owner' or target.user_id = target.owner_id then
    raise exception 'The workspace owner cannot be removed.' using errcode = 'P0001';
  end if;

  delete from public.workspace_members wm where wm.id = p_member_id;

  delete from public.conversation_members cm
  using public.conversations c
  where cm.conversation_id = c.id
    and c.workspace_id = target.workspace_id
    and c.conversation_type = 'workspace_group'
    and cm.user_id = target.user_id;
end;
$$;

-- The direct chat between the caller and a connected researcher: the existing
-- one, or a new one. Both people are members either way.
create or replace function public.start_direct_conversation(p_other_user uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  chat uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  if p_other_user is null or p_other_user = me then
    raise exception 'Choose another researcher.' using errcode = 'P0001';
  end if;

  if not public.are_connected(me, p_other_user) then
    raise exception 'You can message researchers you are connected with.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'direct-chat:' || least(me, p_other_user)::text || ':' || greatest(me, p_other_user)::text, 0));

  select c.id into chat
  from public.conversations c
  where c.conversation_type = 'direct'
    and ((c.participant_one_id = me and c.participant_two_id = p_other_user)
      or (c.participant_one_id = p_other_user and c.participant_two_id = me))
  order by c.created_at
  limit 1;

  if chat is null then
    chat := gen_random_uuid();
    insert into public.conversations (
      id, participant_one_id, participant_two_id, conversation_type, title,
      created_by, last_message_at, updated_at
    ) values (
      chat, me, p_other_user, 'direct',
      coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = p_other_user), 'Direct chat'),
      me, now(), now()
    );
  end if;

  insert into public.conversation_members (conversation_id, user_id, role, last_read_at)
  values (chat, me, 'member', now()), (chat, p_other_user, 'member', now())
  on conflict (conversation_id, user_id) do nothing;

  return chat;
end;
$$;

-- The chat of a collaboration request: the receiver may open it before
-- answering, either side once it is accepted.
create or replace function public.open_research_conversation(p_request_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  req record;
  chat uuid;
begin
  select r.id, r.content_id, r.requester_id, r.receiver_id, r.status into req
  from public.research_requests r
  where r.id = p_request_id;

  if not found or me not in (req.requester_id, req.receiver_id) then
    raise exception 'This request was not found.' using errcode = 'P0002';
  end if;

  if req.status not in ('pending', 'accepted') then
    raise exception 'This request was declined.' using errcode = 'P0001';
  end if;

  if req.status = 'pending' and me is distinct from req.receiver_id then
    raise exception 'You can message about this request once it is accepted.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('request-chat:' || p_request_id::text, 0));

  select c.id into chat from public.conversations c where c.request_id = p_request_id;

  if chat is null then
    chat := gen_random_uuid();
    insert into public.conversations (
      id, request_id, content_id, participant_one_id, participant_two_id,
      conversation_type, created_by, last_message_at, updated_at
    ) values (
      chat, req.id, req.content_id, req.requester_id, req.receiver_id,
      'collaboration', me, now(), now()
    );
  end if;

  insert into public.conversation_members (conversation_id, user_id, role, last_read_at)
  values (chat, req.requester_id, 'member', now()), (chat, req.receiver_id, 'member', now())
  on conflict (conversation_id, user_id) do nothing;

  return chat;
end;
$$;

-- Answering a request: the new status, what follows from it (chat or
-- connection) and the notice to the sender, all at once.
create or replace function public.respond_to_research_request(p_request_id uuid, p_status text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  req record;
  chat uuid;
begin
  select r.id, r.content_id, r.requester_id, r.receiver_id, r.status into req
  from public.research_requests r
  where r.id = p_request_id;

  if not found or req.receiver_id is distinct from me then
    raise exception 'Only the person who received this request can answer it.' using errcode = '42501';
  end if;

  if p_status not in ('accepted', 'declined') then
    raise exception 'Choose accept or decline.' using errcode = 'P0001';
  end if;

  if req.status <> 'pending' then
    raise exception 'This request was already answered.' using errcode = 'P0001';
  end if;

  -- Only from pending: of two answers sent at the same moment, one wins.
  update public.research_requests r
     set status = p_status,
         updated_at = now()
   where r.id = p_request_id
     and r.status = 'pending';

  if not found then
    raise exception 'This request was already answered.' using errcode = 'P0001';
  end if;

  if p_status = 'accepted' then
    chat := public.open_research_conversation(p_request_id);
  end if;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, link_url,
    content_id, request_id, request_kind
  ) values (
    req.requester_id,
    me,
    case when p_status = 'accepted' then 'request_accepted' else 'request_declined' end,
    case when p_status = 'accepted' then 'Collaboration request accepted' else 'Collaboration request declined' end,
    case when p_status = 'accepted' then 'Your collaboration request was accepted.' else 'Your collaboration request was declined.' end,
    case when p_status = 'accepted' then '/messages?conversation=' || chat::text else '/requests' end,
    req.content_id,
    req.id,
    'research'
  );

  return chat;
end;
$$;

create or replace function public.respond_to_profile_request(p_request_id uuid, p_status text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  req record;
begin
  select r.id, r.requester_id, r.receiver_id, r.status into req
  from public.profile_requests r
  where r.id = p_request_id;

  if not found or req.receiver_id is distinct from me then
    raise exception 'Only the person who received this request can answer it.' using errcode = '42501';
  end if;

  if p_status not in ('accepted', 'declined') then
    raise exception 'Choose accept or decline.' using errcode = 'P0001';
  end if;

  if req.status <> 'pending' then
    raise exception 'This request was already answered.' using errcode = 'P0001';
  end if;

  update public.profile_requests r
     set status = p_status,
         updated_at = now()
   where r.id = p_request_id
     and r.status = 'pending';

  if not found then
    raise exception 'This request was already answered.' using errcode = 'P0001';
  end if;

  if p_status = 'accepted' and not exists (
    select 1 from public.user_connections c
    where (c.user_one_id = req.requester_id and c.user_two_id = req.receiver_id)
       or (c.user_one_id = req.receiver_id and c.user_two_id = req.requester_id)
  ) then
    insert into public.user_connections (user_one_id, user_two_id)
    values (least(req.requester_id, req.receiver_id), greatest(req.requester_id, req.receiver_id))
    on conflict (user_one_id, user_two_id) do nothing;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, link_url, request_id, request_kind
  ) values (
    req.requester_id,
    me,
    case when p_status = 'accepted' then 'request_accepted' else 'request_declined' end,
    case when p_status = 'accepted' then 'Profile request accepted' else 'Profile request declined' end,
    case when p_status = 'accepted' then 'Your profile request was accepted.' else 'Your profile request was declined.' end,
    '/requests',
    req.id,
    'profile'
  );
end;
$$;

create or replace function public.respond_to_paper_access_request(p_request_id uuid, p_status text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  req record;
begin
  select r.id, r.content_id, r.requester_id, r.owner_id, r.status into req
  from public.paper_access_requests r
  where r.id = p_request_id;

  if not found or req.owner_id is distinct from me then
    raise exception 'Only the paper''s author can answer this request.' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject.' using errcode = 'P0001';
  end if;

  if req.status <> 'pending' then
    raise exception 'This request was already answered.' using errcode = 'P0001';
  end if;

  update public.paper_access_requests r
     set status = p_status,
         approved_at = case when p_status = 'approved' then now() else null end,
         rejected_at = case when p_status = 'rejected' then now() else null end,
         updated_at = now()
   where r.id = p_request_id
     and r.status = 'pending';

  if not found then
    raise exception 'This request was already answered.' using errcode = 'P0001';
  end if;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, link_url,
    content_id, request_id, request_kind
  ) values (
    req.requester_id,
    me,
    case when p_status = 'approved' then 'paper_access_approved' else 'paper_access_rejected' end,
    case when p_status = 'approved' then 'Full paper access approved' else 'Full paper access rejected' end,
    case when p_status = 'approved'
         then 'Your full paper access request was approved. You can now open the paper from Feed.'
         else 'Your full paper access request was rejected.' end,
    case when p_status = 'approved' then '/feed?post=' || req.content_id::text else '/requests' end,
    req.content_id,
    req.id,
    'paper_access'
  );
end;
$$;

-- A new post with its co-authors and files, all or nothing. The app uploads
-- the files first (to uploads/{me}/{post id}/...), then calls this. If this
-- fails, the app deletes the uploaded files again.
create or replace function public.create_post(
  p_id uuid,
  p_title text,
  p_content text,
  p_abstract text default null,
  p_post_type text default null,
  p_content_category text default 'general_post',
  p_visibility_mode text default 'public',
  p_full_paper_access_mode text default 'public',
  p_doi text default null,
  p_keywords text default null,
  p_authors jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  is_paper boolean := coalesce(p_content_category, '') = 'research_paper';
  restricted_paper boolean;
  author jsonb;
  author_number integer := 0;
  file jsonb;
  file_path text;
  file_bucket text;
  file_url text;
  file_is_paper boolean;
  public_suffix text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  if p_id is null then
    raise exception 'The post has no id.' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Add a title first.' using errcode = 'P0001';
  end if;

  if coalesce(btrim(p_content), '') = '' and coalesce(btrim(p_abstract), '') = '' then
    raise exception 'Write the post text or an abstract first.' using errcode = 'P0001';
  end if;

  if is_paper and coalesce(btrim(p_abstract), '') = '' then
    raise exception 'For research paper posts, abstract is required.' using errcode = 'P0001';
  end if;

  if jsonb_typeof(coalesce(p_authors, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_authors, '[]'::jsonb)) > 50
     or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 20 then
    raise exception 'Too many co-authors or files.' using errcode = 'P0001';
  end if;

  restricted_paper := is_paper and coalesce(p_full_paper_access_mode, '') in ('request_required', 'private');

  insert into public.contents (
    id, user_id, title, content, abstract, post_type, content_category,
    visibility_mode, full_paper_access_mode, allow_full_paper_request,
    doi, keywords, publication_status
  ) values (
    p_id, me, btrim(p_title), btrim(coalesce(p_content, '')),
    nullif(btrim(coalesce(p_abstract, '')), ''), p_post_type, p_content_category,
    p_visibility_mode, p_full_paper_access_mode,
    is_paper and p_full_paper_access_mode = 'request_required',
    nullif(btrim(coalesce(p_doi, '')), ''), nullif(btrim(coalesce(p_keywords, '')), ''),
    'published'
  );

  for author in select value from jsonb_array_elements(coalesce(p_authors, '[]'::jsonb)) loop
    author_number := author_number + 1;
    insert into public.content_authors (content_id, profile_id, manual_name, author_order, author_role)
    values (
      p_id,
      nullif(author ->> 'profile_id', '')::uuid,
      nullif(btrim(coalesce(author ->> 'manual_name', '')), ''),
      author_number,
      'co_author'
    );
  end loop;

  for file in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    file_path := coalesce(file ->> 'storage_path', '');
    file_bucket := coalesce(file ->> 'bucket_name', '');
    file_url := coalesce(file ->> 'file_url', '');
    file_is_paper := coalesce(file ->> 'file_role', '') = 'full_paper';

    if file_path not like 'uploads/' || me::text || '/' || p_id::text || '/%' then
      raise exception 'A file does not belong to this post.' using errcode = 'P0001';
    end if;

    -- A paper that needs a request (or is private) is never stored publicly.
    if file_bucket <> (case when file_is_paper and restricted_paper then 'restricted-papers' else 'content-files' end) then
      raise exception 'A file is in the wrong place.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from storage.objects o where o.bucket_id = file_bucket and o.name = file_path
    ) then
      raise exception 'A file did not finish uploading. Try again.' using errcode = 'P0001';
    end if;

    if file_bucket = 'content-files' then
      public_suffix := '/storage/v1/object/public/content-files/' || file_path;
      if file_url !~ '^https?://' or right(file_url, length(public_suffix)) <> public_suffix then
        raise exception 'A file link is not valid.' using errcode = 'P0001';
      end if;
    else
      file_url := '';
    end if;

    insert into public.content_attachments (
      content_id, file_url, storage_path, original_name, mime_type, file_ext, file_size,
      attachment_type, bucket_name, access_level, file_role, is_full_paper, is_preview_file
    ) values (
      p_id,
      file_url,
      file_path,
      left(coalesce(nullif(btrim(file ->> 'original_name'), ''), 'file'), 255),
      nullif(file ->> 'mime_type', ''),
      nullif(file ->> 'file_ext', ''),
      nullif(file ->> 'file_size', '')::bigint,
      coalesce(nullif(file ->> 'attachment_type', ''), 'file'),
      file_bucket,
      case when file_bucket = 'restricted-papers' then 'restricted' else 'public' end,
      case when file_is_paper then 'full_paper' else 'attachment' end,
      file_is_paper,
      not file_is_paper
    );
  end loop;

  return p_id;
end;
$$;

revoke all on function public.ensure_workspace_chat(uuid) from public, anon;
revoke all on function public.create_workspace(text, text, text, date, text) from public, anon;
revoke all on function public.make_workspace_shared(uuid) from public, anon;
revoke all on function public.add_workspace_member(uuid, uuid) from public, anon;
revoke all on function public.remove_workspace_member(uuid) from public, anon;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
revoke all on function public.open_research_conversation(uuid) from public, anon;
revoke all on function public.respond_to_research_request(uuid, text) from public, anon;
revoke all on function public.respond_to_profile_request(uuid, text) from public, anon;
revoke all on function public.respond_to_paper_access_request(uuid, text) from public, anon;
revoke all on function public.create_post(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb) from public, anon;

grant execute on function public.ensure_workspace_chat(uuid) to authenticated, service_role;
grant execute on function public.create_workspace(text, text, text, date, text) to authenticated, service_role;
grant execute on function public.make_workspace_shared(uuid) to authenticated, service_role;
grant execute on function public.add_workspace_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.start_direct_conversation(uuid) to authenticated, service_role;
grant execute on function public.open_research_conversation(uuid) to authenticated, service_role;
grant execute on function public.respond_to_research_request(uuid, text) to authenticated, service_role;
grant execute on function public.respond_to_profile_request(uuid, text) to authenticated, service_role;
grant execute on function public.respond_to_paper_access_request(uuid, text) to authenticated, service_role;
grant execute on function public.create_post(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb) to authenticated, service_role;

-- ============================================================================
-- 10. Older rows that newer rules would trip over
-- ============================================================================

-- Notification links must stay inside the app (RG-08). The rule from 12 Oct
-- let "/<tab>/other.site" through (browsers drop the tab and open the other
-- site), so it now also refuses spaces and control characters. Older rows that
-- break it lose the link, and the rule then covers every row. Until now it did
-- not, and Postgres checks such a rule again whenever a row changes: deleting
-- an account (which clears actor_id on the notifications it sent) failed on
-- any of those older rows.
alter table public.notifications drop constraint if exists notifications_link_url_internal;

update public.notifications
   set link_url = null
 where link_url is not null
   and link_url !~ '^/([^/\\[:space:][:cntrl:]][^[:space:][:cntrl:]]*)?$';

alter table public.notifications
  add constraint notifications_link_url_internal
  check (link_url is null or link_url ~ '^/([^/\\[:space:][:cntrl:]][^[:space:][:cntrl:]]*)?$');

-- Meetings made before random room names (RG-22) get new, unguessable rooms.
update public.workspace_meetings m
   set provider = 'jitsi',
       room_name = fresh.room,
       meeting_url = 'https://meet.jit.si/' || fresh.room
  from (
    select x.id, 'ResearchGram-' || replace(gen_random_uuid()::text, '-', '') as room
    from public.workspace_meetings x
    where x.room_name !~ '^ResearchGram-[0-9a-f]{32}$'
  ) fresh
 where m.id = fresh.id;
