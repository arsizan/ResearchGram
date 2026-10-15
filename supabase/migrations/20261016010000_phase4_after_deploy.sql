-- Phase 4, part 2. Run AFTER the Phase 4 code is live on Vercel.
--
-- Sending a message now moves its chat to the top inside the database
-- (trigger messages_touch_conversation), and chats are opened through database
-- functions. Browsers no longer need to change conversations at all, so they
-- can no longer push a chat to the top of other people's lists either.
--
-- To undo (the second statement needs no undo):
--   grant update (last_message_at, updated_at) on table public.conversations to authenticated;

revoke update on table public.conversations from authenticated;

-- A chat time a browser set in the future (possible until now) would keep that
-- chat at the top for good: use the time of its latest message instead.
update public.conversations c
   set last_message_at = coalesce(
         (select max(m.created_at) from public.messages m
           where m.conversation_id = c.id and m.created_at <= now()),
         least(c.created_at, now())),
       updated_at = least(c.updated_at, now())
 where c.last_message_at > now()
    or c.updated_at > now();
