-- Closes the full text of posts to direct reads (audit RG-07). 15 Oct 2026.
--
-- Run AFTER the Phase 3 app code is live: older code still reads `content`
-- directly and would stop loading posts. Safe to run more than once.
--
-- Signed-in users keep every other column of the posts they can see. The full
-- text comes only from readable_post_texts() (public posts, your own posts, and
-- abstract-only posts whose owner approved your access request). Realtime also
-- leaves out columns a user cannot read, so the text does not leak through
-- change events either.
--
-- Undo (opens the column again): grant select on public.contents to authenticated;

revoke select on public.contents from anon, authenticated;
grant select (
  id, user_id, created_at, updated_at, title, post_type, content_category, abstract,
  visibility_mode, full_paper_access_mode, allow_full_paper_request, doi,
  publication_status, publisher_name, publication_date, keywords
) on public.contents to authenticated;
