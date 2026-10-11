-- ResearchGram Phase B: row level security on every table (12 Oct 2026).
-- Run AFTER the 11 Oct lock-down. Safe to run more than once.
--
-- Who can see what after this:
--   profiles        every signed-in user reads; you write only your own row; email always = login email
--   contents        public + abstract_only posts readable by signed-in users; private only by the author
--   attachments, comments, co-authors, extracted images   follow the post they belong to
--   saved_posts     only your own (counts come from post_engagement_counts)
--   requests        only the requester and the receiver; only the receiver changes the status
--   connections     only the two people, and only after an accepted request
--   conversations, members, messages   only the people in the conversation
--   workspace files private bucket, workspace members only

-- ============================================================================
-- 1. Helper functions. SECURITY DEFINER so policies can check membership
--    without recursing into the policies of the table they read.
-- ============================================================================

create or replace function public.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = target_conversation_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Participants, the creator, or (for a workspace group chat) the workspace owner.
create or replace function public.can_manage_conversation(target_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and (
        (select auth.uid()) in (c.created_by, c.participant_one_id, c.participant_two_id)
        or exists (
          select 1 from public.workspaces w
          where w.id = c.workspace_id and w.owner_id = (select auth.uid())
        )
      )
  );
$$;

-- Who may be added: a participant, or for a workspace group chat a workspace member/owner.
create or replace function public.can_join_conversation(target_conversation_id uuid, target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = target_conversation_id
      and (
        target_user_id in (c.participant_one_id, c.participant_two_id)
        or (
          c.conversation_type = 'workspace_group' and c.workspace_id is not null and (
            exists (select 1 from public.workspace_members wm
                    where wm.workspace_id = c.workspace_id and wm.user_id = target_user_id)
            or exists (select 1 from public.workspaces w
                       where w.id = c.workspace_id and w.owner_id = target_user_id)
          )
        )
      )
  );
$$;

-- First folder of a storage path as a workspace id; null when it is not a uuid.
create or replace function public.workspace_id_from_path(object_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return (string_to_array(object_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;

-- Save and collaboration-request counts for posts the caller can see,
-- without revealing who saved or who asked.
create or replace function public.post_engagement_counts(content_ids uuid[])
returns table (content_id uuid, save_count bigint, request_count bigint)
language sql stable security definer set search_path = ''
as $$
  select c.id,
         (select count(*) from public.saved_posts s where s.content_id = c.id),
         (select count(*) from public.research_requests r
           where r.content_id = c.id and r.request_type = 'collaboration')
  from public.contents c
  where c.id = any(content_ids)
    and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()));
$$;

-- Rejects changes to the columns named in the trigger arguments.
create or replace function public.guard_immutable_columns()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  col text;
begin
  foreach col in array tg_argv loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'column "%" cannot be changed', col using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

-- New account -> profile row, filled from the sign-up form's metadata (audit RG-12).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, department, skills)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'department'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'skills'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- profiles.email always equals the login email, whatever the browser sends (audit RG-09).
create or replace function public.profiles_use_login_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  login_email text;
begin
  select u.email into login_email from auth.users u where u.id = new.id;
  if found then
    new.email := coalesce(login_email, '');
  end if;
  return new;
end;
$$;

-- Follows a login email change into the profile.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, ''), updated_at = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

drop trigger if exists profiles_use_login_email on public.profiles;
create trigger profiles_use_login_email
  before insert or update of email on public.profiles
  for each row execute function public.profiles_use_login_email();

drop trigger if exists conversation_members_keys_immutable on public.conversation_members;
create trigger conversation_members_keys_immutable
  before update on public.conversation_members
  for each row execute function public.guard_immutable_columns('conversation_id', 'user_id');

-- Only signed-in users may call the helpers; trigger functions are not callable at all.
revoke all on function public.is_conversation_member(uuid) from public, anon;
revoke all on function public.can_manage_conversation(uuid) from public, anon;
revoke all on function public.can_join_conversation(uuid, uuid) from public, anon;
revoke all on function public.post_engagement_counts(uuid[]) from public, anon;
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_owner(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;
grant execute on function public.can_manage_conversation(uuid) to authenticated, service_role;
grant execute on function public.can_join_conversation(uuid, uuid) to authenticated, service_role;
grant execute on function public.post_engagement_counts(uuid[]) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_owner(uuid) to authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.profiles_use_login_email() from public, anon, authenticated;
revoke all on function public.sync_profile_email() from public, anon, authenticated;
revoke all on function public.guard_immutable_columns() from public, anon, authenticated;

-- ============================================================================
-- 2. Data and constraint fixes
-- ============================================================================

-- Conversations started from Network and Requests never got member rows (audit RG-10).
insert into public.conversation_members (conversation_id, user_id, role)
select distinct c.id, p.user_id, 'member'
from public.conversations c
cross join lateral (values (c.participant_one_id), (c.participant_two_id)) as p(user_id)
where p.user_id is not null
on conflict (conversation_id, user_id) do nothing;

alter table public.contents alter column user_id set default auth.uid();
alter table public.workspace_files alter column file_url drop not null;

do $$
begin
  -- A profile belongs to a login; deleting the login deletes the profile.
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey') then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade not valid;
  end if;
  -- Notification links must stay inside the app (audit RG-08).
  if not exists (select 1 from pg_constraint where conname = 'notifications_link_url_internal') then
    alter table public.notifications
      add constraint notifications_link_url_internal
      check (link_url is null or link_url ~ '^/([^/\\]|$)') not valid;
  end if;
end;
$$;

-- ============================================================================
-- 3. Table privileges. Explicit, because from 30 Oct Supabase stops granting
--    them automatically. Column lists limit what a row's owner may change.
-- ============================================================================

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Messages: readers may only mark as read. Nobody edits someone else's text.
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- Conversations: members may only bump the activity timestamps.
revoke update on public.conversations from authenticated;
grant update (last_message_at, updated_at) on public.conversations to authenticated;

-- Requests: only the status moves.
revoke update on public.profile_requests from authenticated;
grant update (status, updated_at) on public.profile_requests to authenticated;
revoke update on public.research_requests from authenticated;
grant update (status, updated_at) on public.research_requests to authenticated;

-- ============================================================================
-- 4. Row level security on the 12 tables that had none
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.contents enable row level security;
alter table public.content_attachments enable row level security;
alter table public.comments enable row level security;
alter table public.paper_extracted_images enable row level security;
alter table public.saved_posts enable row level security;
alter table public.research_requests enable row level security;
alter table public.profile_requests enable row level security;
alter table public.user_connections enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- ---------- profiles ----------
drop policy if exists "profiles: signed-in users read" on public.profiles;
create policy "profiles: signed-in users read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- contents ----------
drop policy if exists "contents: read unless private" on public.contents;
create policy "contents: read unless private" on public.contents
  for select to authenticated
  using (coalesce(visibility_mode, 'public') <> 'private' or user_id = (select auth.uid()));
drop policy if exists "contents: insert own" on public.contents;
create policy "contents: insert own" on public.contents
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "contents: update own" on public.contents;
create policy "contents: update own" on public.contents
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "contents: delete own" on public.contents;
create policy "contents: delete own" on public.contents
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- content_attachments (follow the post) ----------
drop policy if exists "attachments: read with post" on public.content_attachments;
create policy "attachments: read with post" on public.content_attachments
  for select to authenticated
  using (exists (select 1 from public.contents c
                 where c.id = content_attachments.content_id
                   and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))));
drop policy if exists "attachments: post author writes" on public.content_attachments;
create policy "attachments: post author writes" on public.content_attachments
  for all to authenticated
  using (exists (select 1 from public.contents c
                 where c.id = content_attachments.content_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.contents c
                      where c.id = content_attachments.content_id and c.user_id = (select auth.uid())));

-- ---------- paper_extracted_images (follow the post) ----------
drop policy if exists "extracted images: read with post" on public.paper_extracted_images;
create policy "extracted images: read with post" on public.paper_extracted_images
  for select to authenticated
  using (exists (select 1 from public.contents c
                 where c.id = paper_extracted_images.content_id
                   and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))));
drop policy if exists "extracted images: post author writes" on public.paper_extracted_images;
create policy "extracted images: post author writes" on public.paper_extracted_images
  for all to authenticated
  using (exists (select 1 from public.contents c
                 where c.id = paper_extracted_images.content_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.contents c
                      where c.id = paper_extracted_images.content_id and c.user_id = (select auth.uid())));

-- ---------- content_authors: was readable for every post, now follows the post ----------
drop policy if exists "content authors are readable" on public.content_authors;
drop policy if exists "content authors: read with post" on public.content_authors;
create policy "content authors: read with post" on public.content_authors
  for select to authenticated
  using (exists (select 1 from public.contents c
                 where c.id = content_authors.content_id
                   and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))));

-- ---------- comments ----------
drop policy if exists "comments: read with post" on public.comments;
create policy "comments: read with post" on public.comments
  for select to authenticated
  using (exists (select 1 from public.contents c
                 where c.id = comments.content_id
                   and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))));
drop policy if exists "comments: insert own on visible post" on public.comments;
create policy "comments: insert own on visible post" on public.comments
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.contents c
                          where c.id = comments.content_id
                            and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))));
drop policy if exists "comments: update own" on public.comments;
create policy "comments: update own" on public.comments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "comments: author or post owner deletes" on public.comments;
create policy "comments: author or post owner deletes" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.contents c
                    where c.id = comments.content_id and c.user_id = (select auth.uid())));

-- ---------- saved_posts (private to the saver) ----------
drop policy if exists "saved posts: read own" on public.saved_posts;
create policy "saved posts: read own" on public.saved_posts
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "saved posts: save visible post" on public.saved_posts;
create policy "saved posts: save visible post" on public.saved_posts
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.contents c
                          where c.id = saved_posts.content_id
                            and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))));
drop policy if exists "saved posts: delete own" on public.saved_posts;
create policy "saved posts: delete own" on public.saved_posts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- research_requests ----------
drop policy if exists "research requests: parties read" on public.research_requests;
create policy "research requests: parties read" on public.research_requests
  for select to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id));
drop policy if exists "research requests: send pending" on public.research_requests;
create policy "research requests: send pending" on public.research_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid())
              and receiver_id <> (select auth.uid())
              and status = 'pending'
              and exists (select 1 from public.contents c
                          where c.id = research_requests.content_id
                            and c.user_id in (research_requests.requester_id, research_requests.receiver_id)));
drop policy if exists "research requests: receiver answers" on public.research_requests;
create policy "research requests: receiver answers" on public.research_requests
  for update to authenticated
  using (receiver_id = (select auth.uid())) with check (receiver_id = (select auth.uid()));

-- ---------- profile_requests (connection and mentorship) ----------
drop policy if exists "profile requests: parties read" on public.profile_requests;
create policy "profile requests: parties read" on public.profile_requests
  for select to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id));
drop policy if exists "profile requests: send pending" on public.profile_requests;
create policy "profile requests: send pending" on public.profile_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid())
              and receiver_id <> (select auth.uid())
              and status = 'pending');
drop policy if exists "profile requests: receiver answers" on public.profile_requests;
create policy "profile requests: receiver answers" on public.profile_requests
  for update to authenticated
  using (receiver_id = (select auth.uid())) with check (receiver_id = (select auth.uid()));

-- ---------- user_connections (only after an accepted request) ----------
drop policy if exists "connections: parties read" on public.user_connections;
create policy "connections: parties read" on public.user_connections
  for select to authenticated
  using ((select auth.uid()) in (user_one_id, user_two_id));
drop policy if exists "connections: create after accepted request" on public.user_connections;
create policy "connections: create after accepted request" on public.user_connections
  for insert to authenticated
  with check ((select auth.uid()) in (user_one_id, user_two_id)
              and user_one_id <> user_two_id
              and exists (select 1 from public.profile_requests pr
                          where pr.status = 'accepted'
                            and ((pr.requester_id = user_connections.user_one_id and pr.receiver_id = user_connections.user_two_id)
                              or (pr.requester_id = user_connections.user_two_id and pr.receiver_id = user_connections.user_one_id))));
drop policy if exists "connections: parties update" on public.user_connections;
create policy "connections: parties update" on public.user_connections
  for update to authenticated
  using ((select auth.uid()) in (user_one_id, user_two_id))
  with check ((select auth.uid()) in (user_one_id, user_two_id)
              and user_one_id <> user_two_id
              and exists (select 1 from public.profile_requests pr
                          where pr.status = 'accepted'
                            and ((pr.requester_id = user_connections.user_one_id and pr.receiver_id = user_connections.user_two_id)
                              or (pr.requester_id = user_connections.user_two_id and pr.receiver_id = user_connections.user_one_id))));
drop policy if exists "connections: parties delete" on public.user_connections;
create policy "connections: parties delete" on public.user_connections
  for delete to authenticated
  using ((select auth.uid()) in (user_one_id, user_two_id));

-- ---------- conversations ----------
drop policy if exists "conversations: people in it read" on public.conversations;
create policy "conversations: people in it read" on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (created_by, participant_one_id, participant_two_id)
         or public.is_conversation_member(id));
drop policy if exists "conversations: participant creates" on public.conversations;
create policy "conversations: participant creates" on public.conversations
  for insert to authenticated
  with check ((select auth.uid()) in (participant_one_id, participant_two_id)
              and (created_by is null or created_by = (select auth.uid()))
              and (workspace_id is null or public.is_workspace_owner(workspace_id))
              and (request_id is null or exists (
                    select 1 from public.research_requests r
                    where r.id = conversations.request_id
                      and (select auth.uid()) in (r.requester_id, r.receiver_id))));
drop policy if exists "conversations: people in it update" on public.conversations;
create policy "conversations: people in it update" on public.conversations
  for update to authenticated
  using ((select auth.uid()) in (participant_one_id, participant_two_id) or public.is_conversation_member(id))
  with check ((select auth.uid()) in (participant_one_id, participant_two_id) or public.is_conversation_member(id));

-- ---------- conversation_members ----------
drop policy if exists "conversation members: read" on public.conversation_members;
create policy "conversation members: read" on public.conversation_members
  for select to authenticated
  using (user_id = (select auth.uid())
         or public.is_conversation_member(conversation_id)
         or public.can_manage_conversation(conversation_id));
drop policy if exists "conversation members: manager adds allowed people" on public.conversation_members;
create policy "conversation members: manager adds allowed people" on public.conversation_members
  for insert to authenticated
  with check (public.can_manage_conversation(conversation_id)
              and public.can_join_conversation(conversation_id, user_id));
drop policy if exists "conversation members: own row or manager updates" on public.conversation_members;
create policy "conversation members: own row or manager updates" on public.conversation_members
  for update to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_conversation(conversation_id))
  with check (user_id = (select auth.uid()) or public.can_manage_conversation(conversation_id));
drop policy if exists "conversation members: leave or manager removes" on public.conversation_members;
create policy "conversation members: leave or manager removes" on public.conversation_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.can_manage_conversation(conversation_id));

-- ---------- messages ----------
drop policy if exists "messages: members read" on public.messages;
create policy "messages: members read" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "messages: members send as themselves" on public.messages;
create policy "messages: members send as themselves" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_conversation_member(conversation_id));
drop policy if exists "messages: members mark read" on public.messages;
create policy "messages: members mark read" on public.messages
  for update to authenticated
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

-- ============================================================================
-- 5. Private bucket for workspace files (audit RG-05). Path: {workspace_id}/{user_id}/{file}
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "workspace-files: members read" on storage.objects;
create policy "workspace-files: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'workspace-files'
         and (public.is_workspace_member(public.workspace_id_from_path(name))
              or public.is_workspace_owner(public.workspace_id_from_path(name))));
drop policy if exists "workspace-files: members upload to own folder" on storage.objects;
create policy "workspace-files: members upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workspace-files'
              and (storage.foldername(name))[2] = (select auth.uid())::text
              and (public.is_workspace_member(public.workspace_id_from_path(name))
                   or public.is_workspace_owner(public.workspace_id_from_path(name))));
drop policy if exists "workspace-files: uploader or owner deletes" on storage.objects;
create policy "workspace-files: uploader or owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'workspace-files'
         and ((storage.foldername(name))[2] = (select auth.uid())::text
              or public.is_workspace_owner(public.workspace_id_from_path(name))));
