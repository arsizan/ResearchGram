-- AcademicOrbit: the platform's new name (9 Nov 2026). ResearchGate GmbH objected
-- to the old name on 20 Oct 2026.
--
-- 1. Five functions are made again so that what they say or store uses the new
--    name. Each body is the latest version, copied unchanged except for the name:
--      export_my_data                  (Phase 5)  the "format" of the download
--      delete_my_account               (Phase 4)  name shown for a deleted author, error text
--      verify_orcid                    (Phase 4)  two problem messages
--      workspace_meetings_random_room  (Phase 4)  start of each new meeting room name
--      accept_terms                    (Phase 5)  the age message
--    "create or replace" keeps each function's owner and grants. They are stated
--    again at the end anyway, so this file is complete on its own.
-- 2. Rows that still hold the old name get the new one: meeting rooms (the random
--    part stays the same), the name shown for authors whose account was deleted,
--    and the app's default text of a connection request. Nothing a member wrote
--    themselves is changed.
--
-- Safe to run more than once. Older migration files keep the old name: they are
-- the record of what was applied, so they are never edited.

-- Phase 5 must already be in place: two of the functions below are its versions.
do $$
begin
  if to_regclass('public.user_consents') is null
     or to_regprocedure('public.accept_terms(text, boolean)') is null then
    raise exception 'Run supabase/migrations/20261017000000_phase5.sql first, then this file.';
  end if;
end $$;

-- ============================================================================
-- 1. Functions
-- ============================================================================

-- Everything AcademicOrbit stores about the caller, as one JSON document.
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
    'format', 'academicorbit-export-1',
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at)
                from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = me),
    'consent', (select jsonb_build_object('terms_version', x.terms_version, 'accepted_at', x.accepted_at,
                                          'age_confirmed', x.age_confirmed)
                from public.user_consents x where x.user_id = me),
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
           'Former AcademicOrbit member')
   where x.profile_id = me;

  -- Posts do not follow the profile automatically.
  delete from public.contents c where c.user_id = me;

  begin
    -- The profile, and everything else that belongs to it, follows the login.
    delete from auth.users u where u.id = me;
  exception when insufficient_privilege then
    raise exception 'Account deletion is not available yet. Please contact the AcademicOrbit team.' using errcode = 'P0001';
  end;

  delete from public.profiles p where p.id = me;

  perform public.write_audit('account.deleted', 'user', me::text, stats);
end;
$$;

create or replace function public.verify_orcid(p_code text, p_redirect_uri text)
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
    return query select null::text, null::timestamptz, 'ORCID sent an answer AcademicOrbit could not read.'::text;
    return;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.orcid_id = confirmed and p.orcid_verified_at is not null and p.id <> me
  ) then
    return query select null::text, null::timestamptz, 'This ORCID iD is already verified on another AcademicOrbit account.'::text;
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
    return query select null::text, null::timestamptz, 'This ORCID iD is already verified on another AcademicOrbit account.'::text;
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

-- The room name is made here, so it cannot be guessed from the workspace id or
-- the time, whatever the browser sends.
create or replace function public.workspace_meetings_random_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.provider := 'jitsi';
  new.room_name := 'AcademicOrbit-' || replace(gen_random_uuid()::text, '-', '');
  new.meeting_url := 'https://meet.jit.si/' || new.room_name;
  return new;
end;
$$;

create or replace function public.accept_terms(p_version text, p_age_confirmed boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  saved timestamptz;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  if p_version is distinct from public.current_terms_version() then
    raise exception 'The Terms were updated. Reload the page and read the new version.' using errcode = 'P0001';
  end if;

  if p_age_confirmed is not true then
    raise exception 'AcademicOrbit is for people aged 18 or older. Confirm your age to continue.' using errcode = 'P0001';
  end if;

  insert into public.user_consents as uc (user_id, terms_version, accepted_at, age_confirmed)
  values (me, p_version, now(), true)
  on conflict (user_id) do update
    set terms_version = excluded.terms_version, accepted_at = excluded.accepted_at, age_confirmed = true
  returning uc.accepted_at into saved;

  return saved;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated, service_role;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated, service_role;
revoke all on function public.verify_orcid(text, text) from public, anon;
grant execute on function public.verify_orcid(text, text) to authenticated, service_role;
revoke all on function public.workspace_meetings_random_room() from public, anon, authenticated;
revoke all on function public.accept_terms(text, boolean) from public, anon;
grant execute on function public.accept_terms(text, boolean) to authenticated, service_role;

-- ============================================================================
-- 2. Rows that still hold the old name
-- ============================================================================

-- Meeting rooms: same random part, new start. Links shared before this change
-- open an empty room; the app shows the new link.
update public.workspace_meetings
   set room_name   = 'AcademicOrbit-' || substring(room_name from '^ResearchGram-([0-9a-f]{32})$'),
       meeting_url = 'https://meet.jit.si/AcademicOrbit-' || substring(room_name from '^ResearchGram-([0-9a-f]{32})$')
 where room_name ~ '^ResearchGram-[0-9a-f]{32}$';

-- The name delete_my_account wrote for authors whose account is gone.
update public.content_authors
   set manual_name = 'Former AcademicOrbit member'
 where manual_name = 'Former ResearchGram member';

-- The text the app filled in for "Connect" (members could not edit it).
update public.profile_requests
   set message = 'I would like to connect with you on AcademicOrbit.'
 where message = 'I would like to connect with you on ResearchGram.';
