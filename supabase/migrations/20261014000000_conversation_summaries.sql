-- One source for chat unread counts and last-message previews (audit RG-18, RG-19).
--
-- Before: the Messages page counted unread from the newest 120 messages across all
-- chats (a busy chat hid the others), and the nav badge used messages.read_at, which
-- one reader sets for everyone in a group chat. Now both read this function.
--
-- Unread = messages from someone else, newer than my last_read_at in that chat,
-- not deleted. Only chats I am a member of are returned. Safe to run more than once.

create or replace function public.my_conversation_summaries()
returns table (
  conversation_id uuid,
  unread_count bigint,
  last_message_id uuid,
  last_message_body text,
  last_message_sender_id uuid,
  last_message_read_at timestamptz,
  last_message_created_at timestamptz
)
language sql stable security definer set search_path = ''
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
    lm.created_at
  from public.conversation_members m
  left join lateral (
    select x.id, coalesce(x.body, x.message_text) as body, x.sender_id, x.read_at, x.created_at
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

-- Read times use the database clock. Messages get their time from the database,
-- so a read time from a browser whose clock is wrong would hide new messages
-- (clock ahead) or keep read ones unread (clock behind). When the app sets
-- last_read_at, the database's own time is stored instead. The service role and
-- admins keep the value they set (for example when moving data).

create or replace function public.conversation_members_server_read_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.last_read_at is not null
     and (tg_op = 'INSERT' or new.last_read_at is distinct from old.last_read_at) then
    new.last_read_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_members_server_read_time on public.conversation_members;
create trigger conversation_members_server_read_time
  before insert or update of last_read_at on public.conversation_members
  for each row execute function public.conversation_members_server_read_time();

revoke all on function public.conversation_members_server_read_time() from public, anon, authenticated;
