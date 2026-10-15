-- ResearchGram Phase 5: pre-launch hardening (Oct 2026).
-- Run after 20261016010000_phase4_after_deploy.sql, BEFORE the Phase 5 code goes
-- live: the Phase 4 code keeps working with it. Safe to run more than once.
--
--   1. Faster row checks and joins (what Supabase's Performance Advisor reports)
--   2. Better search: whole words in any order, word endings, ranking, typos in names
--   3. Terms of Service and Privacy Policy: who accepted which version, and when
--   4. Error log: errors from the app, for admins, kept 30 days
--   5. Data export includes the consent record
--
-- It runs as one transaction: if any step fails, nothing is changed. It waits at
-- most 5 seconds for a table the live site is using; if that is not enough, run
-- it again.

set lock_timeout = '5s';

-- ============================================================================
-- 1. Faster row checks and joins
-- ============================================================================

-- Foreign keys without an index make joins and deletes (account deletion
-- removes rows in many tables) scan whole tables.
create index if not exists comments_user_id_idx on public.comments (user_id);
create index if not exists conversations_content_id_idx on public.conversations (content_id);
create index if not exists conversations_created_by_idx on public.conversations (created_by);
create index if not exists messages_pinned_by_idx on public.messages (pinned_by);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists post_reports_resolved_by_idx on public.post_reports (resolved_by);
create index if not exists saved_posts_content_id_idx on public.saved_posts (content_id);
create index if not exists workspace_files_uploaded_by_idx on public.workspace_files (uploaded_by);
create index if not exists workspace_meetings_created_by_idx on public.workspace_meetings (created_by);
create index if not exists workspace_milestones_created_by_idx on public.workspace_milestones (created_by);
create index if not exists workspace_recordings_recorded_by_idx on public.workspace_recordings (recorded_by);
create index if not exists workspace_tasks_created_by_idx on public.workspace_tasks (created_by);
create index if not exists workspace_updates_author_id_idx on public.workspace_updates (author_id);

-- Older row checks called auth.uid() once for every row they looked at.
-- "(select auth.uid())" is worked out once per query. The rules themselves do
-- not change: each rule is compared before and after, and if a rule in this
-- project was different from what this file expects, everything stops and
-- nothing is changed. A rule missing from this project is left alone.
do $$
declare
  p record;
  old_using text;
  old_check text;
  new_using text;
  new_check text;
  fast constant text := '( SELECT auth.uid() AS uid)';
  me constant text := '(select auth.uid())';
  own_post constant text := 'exists (select 1 from public.contents c where c.id = content_authors.content_id and c.user_id = (select auth.uid()))';
  workspace_member constant text := '(public.is_workspace_member(workspace_id) or public.is_workspace_owner(workspace_id))';
begin
  for p in
    select * from (values
      ('content_authors', 'content owners can delete authors', own_post, null),
      ('content_authors', 'content owners can insert authors', null, own_post),
      ('content_authors', 'content owners can update authors', own_post, own_post),
      ('hidden_posts', 'users can hide posts for themselves', null, 'user_id = ' || me),
      ('hidden_posts', 'users can read their own hidden posts', 'user_id = ' || me, null),
      ('hidden_posts', 'users can unhide their own hidden posts', 'user_id = ' || me, null),
      ('notifications', 'authenticated users can create notifications', null, 'actor_id = ' || me),
      ('notifications', 'users can delete own notifications', 'recipient_id = ' || me, null),
      ('notifications', 'users can read own notifications', 'recipient_id = ' || me, null),
      ('notifications', 'users can update own notifications', 'recipient_id = ' || me, 'recipient_id = ' || me),
      ('paper_access_requests', 'paper access requests visible to requester and owner',
        'requester_id = ' || me || ' or owner_id = ' || me, null),
      ('paper_access_requests', 'paper owner can update access requests', 'owner_id = ' || me, 'owner_id = ' || me),
      ('post_reports', 'users can read their own post reports', 'reporter_id = ' || me, null),
      ('post_reports', 'users can update their own pending reports',
        'reporter_id = ' || me || ' and status = ''pending''', 'reporter_id = ' || me),
      ('profile_view_events', 'users can create own profile view events', null, 'viewer_id = ' || me),
      ('profile_view_events', 'users can read own profile view events', 'viewer_id = ' || me, null),
      ('search_events', 'users can create own search events', null, 'user_id = ' || me),
      ('search_events', 'users can read own search events', 'user_id = ' || me, null),
      ('workspace_files', 'workspace members can create files', null, 'uploaded_by = ' || me || ' and ' || workspace_member),
      ('workspace_meetings', 'workspace members can create meetings', null, 'created_by = ' || me || ' and ' || workspace_member),
      ('workspace_milestones', 'workspace members can create milestones', null, 'created_by = ' || me || ' and ' || workspace_member),
      ('workspace_recordings', 'workspace members can create recordings', null, 'recorded_by = ' || me || ' and ' || workspace_member),
      ('workspace_tasks', 'workspace members can create tasks', null, 'created_by = ' || me || ' and ' || workspace_member),
      ('workspace_updates', 'workspace members can create updates', null, 'author_id = ' || me || ' and ' || workspace_member),
      ('workspaces', 'users can create own workspaces', null, 'owner_id = ' || me),
      ('workspaces', 'workspace owners can update workspaces', 'owner_id = ' || me, 'owner_id = ' || me),
      ('workspaces', 'workspace visible to owner or members', 'owner_id = ' || me || ' or public.is_workspace_member(id)', null)
    ) as v(table_name, policy_name, using_rule, check_rule)
  loop
    select x.qual, x.with_check into old_using, old_check
    from pg_catalog.pg_policies x
    where x.schemaname = 'public' and x.tablename = p.table_name and x.policyname = p.policy_name;

    if found then
      execute format('alter policy %I on public.%I', p.policy_name, p.table_name)
        || coalesce(' using (' || p.using_rule || ')', '')
        || coalesce(' with check (' || p.check_rule || ')', '');

      select x.qual, x.with_check into new_using, new_check
      from pg_catalog.pg_policies x
      where x.schemaname = 'public' and x.tablename = p.table_name and x.policyname = p.policy_name;

      -- Same rule once "(select auth.uid())" is read as "auth.uid()".
      if replace(new_using, fast, 'auth.uid()') is distinct from replace(old_using, fast, 'auth.uid()')
         or replace(new_check, fast, 'auth.uid()') is distinct from replace(old_check, fast, 'auth.uid()') then
        raise exception 'Phase 5 stopped and changed nothing: the rule "%" on table "%" is not the one this file expects. Send this message to Claude.',
          p.policy_name, p.table_name;
      end if;
    end if;
  end loop;
end;
$$;

-- A post's files and extracted figures: the author's rule covered reading too,
-- next to the "read with post" rule, so every read checked two rules. The
-- author now has separate add / change / remove rules; reading is covered by
-- "read with post", which already lets authors see their own posts' files.
drop policy if exists "attachments: post author writes" on public.content_attachments;
drop policy if exists "attachments: post author adds" on public.content_attachments;
drop policy if exists "attachments: post author changes" on public.content_attachments;
drop policy if exists "attachments: post author removes" on public.content_attachments;

create policy "attachments: post author adds"
  on public.content_attachments for insert to authenticated
  with check (
    exists (select 1 from public.contents c
            where c.id = content_attachments.content_id and c.user_id = (select auth.uid()))
    and storage_path like 'uploads/' || (select auth.uid())::text || '/' || content_id::text || '/%'
    and coalesce(bucket_name, 'content-files') in ('content-files', 'restricted-papers')
  );

create policy "attachments: post author changes"
  on public.content_attachments for update to authenticated
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

create policy "attachments: post author removes"
  on public.content_attachments for delete to authenticated
  using (
    exists (select 1 from public.contents c
            where c.id = content_attachments.content_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "extracted images: post author writes" on public.paper_extracted_images;
drop policy if exists "extracted images: post author adds" on public.paper_extracted_images;
drop policy if exists "extracted images: post author changes" on public.paper_extracted_images;
drop policy if exists "extracted images: post author removes" on public.paper_extracted_images;

create policy "extracted images: post author adds"
  on public.paper_extracted_images for insert to authenticated
  with check (
    exists (select 1 from public.contents c
            where c.id = paper_extracted_images.content_id and c.user_id = (select auth.uid()))
  );

create policy "extracted images: post author changes"
  on public.paper_extracted_images for update to authenticated
  using (
    exists (select 1 from public.contents c
            where c.id = paper_extracted_images.content_id and c.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.contents c
            where c.id = paper_extracted_images.content_id and c.user_id = (select auth.uid()))
  );

create policy "extracted images: post author removes"
  on public.paper_extracted_images for delete to authenticated
  using (
    exists (select 1 from public.contents c
            where c.id = paper_extracted_images.content_id and c.user_id = (select auth.uid()))
  );

-- ============================================================================
-- 2. Better search
-- ============================================================================
-- Before (Phase 3): a result had to contain the typed text exactly, words in
-- the same order, and results came newest first. Now a result also counts when
-- it contains every typed word in any order, including longer forms of the
-- words ("network" finds "networks", "bioinf" finds "bioinformatics"), and
-- names forgive small typos ("rahmn" finds "Rahman"). Exact matches still
-- come first. What the old rule found is still found, except a phrase that only
-- existed where two fields met (the last word of a title and the first word of
-- the text); every word of it still matches as a word.
--
-- The work is done by indexes (Postgres full-text search and trigram indexes),
-- so search stays fast as the number of posts and people grows.

-- pg_trgm (similar words and fast "contains" searches) lives with the other
-- extensions. Older projects may have it in "public"; move it.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension e
             join pg_catalog.pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_trgm' and n.nspname <> 'extensions') then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end;
$$;

create extension if not exists pg_trgm with schema extensions;

-- The words of a search as a full-text query: a-z and 0-9 words of 2+
-- characters, at most 8, every word required, each also matching longer words
-- that start with it. NULL when nothing searchable is left (only stop words
-- like "the", or only punctuation).
create or replace function public.rg_tsquery(value text)
returns tsquery
language plpgsql
immutable
set search_path = ''
as $$
declare
  words text[];
  parsed tsquery;
begin
  select array(
    select w.word
    from unnest(string_to_array(public.rg_keyword_text(value), ' ')) with ordinality as w(word, pos)
    where length(w.word) >= 2
    order by w.pos
    limit 8
  ) into words;

  if coalesce(array_length(words, 1), 0) = 0 then
    return null;
  end if;

  -- Words are only a-z and 0-9 here, so they cannot change the query's meaning.
  parsed := to_tsquery('english', array_to_string(array(select w || ':*' from unnest(words) as w), ' & '));

  if numnode(parsed) = 0 then
    return null;
  end if;

  return parsed;
end;
$$;

-- "Contains the typed text" as a LIKE pattern for the trigram indexes. The
-- search text keeps letters, digits, "_" and spaces (rg_search_text), so only
-- "_" needs escaping.
create or replace function public.rg_like_pattern(needle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(coalesce(needle, ''), '_', '\_') || '%';
$$;

-- The helpers below are used by the search indexes. Each long field is cut to a
-- fixed length first: a word index has a size limit (1 MB), and a very long post
-- must still save. They are marked expensive (cost 10000) so that Postgres uses
-- the indexes instead of working them out for every row.
-- If a helper's body is ever changed, rebuild its indexes in the same file
-- ("reindex index ..."): an index keeps the values the old body produced.

-- A post's searchable fields, weighted: title, then keywords, then abstract,
-- then its type. The full text is separate because not every reader may read it.
create or replace function public.rg_post_document(
  title text, abstract text, keywords text, post_type text, content_category text
)
returns tsvector
language sql
immutable
cost 10000
set search_path = ''
as $$
  select setweight(to_tsvector('english', left(coalesce(title, ''), 1000)), 'A')
      || setweight(to_tsvector('english', left(coalesce(keywords, ''), 2000)), 'B')
      || setweight(to_tsvector('english', left(coalesce(abstract, ''), 20000)), 'C')
      || setweight(to_tsvector('english',
           replace(left(coalesce(post_type, ''), 100) || ' ' || left(coalesce(content_category, ''), 100), '_', ' ')), 'D');
$$;

-- A post's full text as words (its first 100,000 characters), weighted lowest.
create or replace function public.rg_post_text_document(content text)
returns tsvector
language sql
immutable
cost 10000
set search_path = ''
as $$
  select setweight(to_tsvector('english', left(coalesce(content, ''), 100000)), 'D');
$$;

-- The same fields as one search text, for "contains the typed text".
create or replace function public.rg_post_fields(
  title text, abstract text, keywords text, post_type text, content_category text
)
returns text
language sql
immutable
cost 10000
set search_path = ''
as $$
  select public.rg_search_text(coalesce(title, '') || ' ' || coalesce(abstract, '') || ' '
           || coalesce(keywords, '') || ' ' || coalesce(post_type, '') || ' ' || coalesce(content_category, ''));
$$;

-- A post's full text as one search text, for "contains the typed text".
create or replace function public.rg_post_text(content text)
returns text
language sql
immutable
cost 10000
set search_path = ''
as $$
  select public.rg_search_text(content);
$$;

-- A profile's searchable fields, weighted: name, then research topics, then
-- where the person works or studies, then the bio.
create or replace function public.rg_profile_document(
  full_name text, skills text, interests text, research_area text, expertise text,
  department text, user_role text, academic_level text, current_position text,
  company_or_institution text, bio text
)
returns tsvector
language sql
immutable
cost 10000
set search_path = ''
as $$
  select setweight(to_tsvector('simple', left(coalesce(full_name, ''), 500)), 'A')
      || setweight(to_tsvector('english', left(coalesce(skills, '') || ' ' || coalesce(interests, '') || ' '
           || coalesce(research_area, '') || ' ' || coalesce(expertise, ''), 20000)), 'B')
      || setweight(to_tsvector('english', left(coalesce(department, '') || ' ' || coalesce(user_role, '') || ' '
           || coalesce(academic_level, '') || ' ' || coalesce(current_position, '') || ' '
           || coalesce(company_or_institution, ''), 5000)), 'C')
      || setweight(to_tsvector('english', left(coalesce(bio, ''), 20000)), 'D');
$$;

-- The fields the Search page always matched, as one search text.
create or replace function public.rg_profile_fields(
  full_name text, email text, department text, skills text, interests text, user_role text,
  academic_level text, batch text, session text, current_position text,
  company_or_institution text, research_area text, expertise text, bio text
)
returns text
language sql
immutable
cost 10000
set search_path = ''
as $$
  select public.rg_search_text(
    coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(department, '') || ' '
    || coalesce(skills, '') || ' ' || coalesce(interests, '') || ' ' || coalesce(user_role, '') || ' '
    || coalesce(academic_level, '') || ' ' || coalesce(batch, '') || ' ' || coalesce(session, '') || ' '
    || coalesce(current_position, '') || ' ' || coalesce(company_or_institution, '') || ' '
    || coalesce(research_area, '') || ' ' || coalesce(expertise, '') || ' ' || coalesce(bio, ''));
$$;

revoke all on function public.rg_tsquery(text) from public, anon;
revoke all on function public.rg_like_pattern(text) from public, anon;
revoke all on function public.rg_post_document(text, text, text, text, text) from public, anon;
revoke all on function public.rg_post_text_document(text) from public, anon;
revoke all on function public.rg_post_fields(text, text, text, text, text) from public, anon;
revoke all on function public.rg_post_text(text) from public, anon;
revoke all on function public.rg_profile_document(text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.rg_profile_fields(text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.rg_tsquery(text) to authenticated, service_role;
grant execute on function public.rg_like_pattern(text) to authenticated, service_role;
grant execute on function public.rg_post_document(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.rg_post_text_document(text) to authenticated, service_role;
grant execute on function public.rg_post_fields(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.rg_post_text(text) to authenticated, service_role;
grant execute on function public.rg_profile_document(text, text, text, text, text, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.rg_profile_fields(text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated, service_role;

-- Posts: every word (fields and full text together), "contains" in the fields,
-- "contains" in the full text.
create index if not exists contents_search_words_idx on public.contents
  using gin ((public.rg_post_document(title, abstract, keywords, post_type, content_category)
              || public.rg_post_text_document(content)));
create index if not exists contents_search_fields_trgm_idx on public.contents
  using gin (public.rg_post_fields(title, abstract, keywords, post_type, content_category) extensions.gin_trgm_ops);
create index if not exists contents_search_text_trgm_idx on public.contents
  using gin (public.rg_post_text(content) extensions.gin_trgm_ops);

create index if not exists profiles_search_document_idx on public.profiles
  using gin (public.rg_profile_document(full_name, skills, interests, research_area, expertise, department,
    user_role, academic_level, current_position, company_or_institution, bio));
create index if not exists profiles_search_fields_trgm_idx on public.profiles
  using gin (public.rg_profile_fields(full_name, email, department, skills, interests, user_role, academic_level,
    batch, session, current_position, company_or_institution, research_area, expertise, bio) extensions.gin_trgm_ops);
create index if not exists profiles_name_trgm_idx on public.profiles
  using gin (lower(coalesce(full_name, '')) extensions.gin_trgm_ops);

-- People (Search page). Same columns and limits as before; better matches first:
-- a name that starts with the search, then the typed text anywhere, then how
-- well the words match (name > topics > work > bio), then similar names.
-- Only the first 200 characters of a search are used.
create or replace function public.search_researchers(search_text text, max_results integer default 40)
returns setof public.profiles
language plpgsql
stable
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  typed text := left(coalesce(search_text, ''), 200);
  needle text := public.rg_search_text(typed);
  words tsquery := public.rg_tsquery(typed);
  pattern text := public.rg_like_pattern(public.rg_search_text(typed));
  name_start text := replace(public.rg_search_text(typed), '_', '\_') || '%';
begin
  if needle = '' then
    return;
  end if;

  return query
  select (f.profile).*
  from (
    select p as profile,
           p.id as profile_id,
           p.full_name as name,
           p.profile_completion_score as completeness,
           public.rg_search_text(p.full_name) like name_start as name_starts,
           public.rg_profile_fields(p.full_name, p.email, p.department, p.skills, p.interests, p.user_role,
             p.academic_level, p.batch, p.session, p.current_position, p.company_or_institution,
             p.research_area, p.expertise, p.bio) like pattern as has_text,
           coalesce(ts_rank_cd(public.rg_profile_document(p.full_name, p.skills, p.interests, p.research_area,
             p.expertise, p.department, p.user_role, p.academic_level, p.current_position,
             p.company_or_institution, p.bio), words), 0) as word_rank,
           case when length(needle) <= 60
                then extensions.word_similarity(needle, lower(coalesce(p.full_name, '')))
                else 0 end as name_similarity
    from public.profiles p
    where p.id <> me
      and (
        public.rg_profile_fields(p.full_name, p.email, p.department, p.skills, p.interests, p.user_role,
          p.academic_level, p.batch, p.session, p.current_position, p.company_or_institution,
          p.research_area, p.expertise, p.bio) like pattern
        or (words is not null
            and public.rg_profile_document(p.full_name, p.skills, p.interests, p.research_area, p.expertise,
              p.department, p.user_role, p.academic_level, p.current_position, p.company_or_institution,
              p.bio) @@ words)
        -- Similar names (typos), for searches of name length.
        or (length(needle) between 3 and 60
            and needle operator(extensions.<%) lower(coalesce(p.full_name, '')))
      )
  ) f
  order by f.name_starts desc, f.has_text desc, f.word_rank desc, f.name_similarity desc,
           f.completeness desc nulls last, f.name nulls last, f.profile_id
  limit least(greatest(coalesce(max_results, 40), 1), 100);
end;
$$;

revoke all on function public.search_researchers(text, integer) from public, anon;
grant execute on function public.search_researchers(text, integer) to authenticated, service_role;

-- Posts (Search page). Same columns, limits and privacy rules as before: other
-- people's private posts and posts you hid are left out, and the full text is
-- only searched (and returned) when you may read it. Better matches first: the
-- typed text itself, then how well the words match, then newer posts.
-- For a reader of the full text, the words may be spread over the title, the
-- abstract and the text. Only the first 200 characters of a search are used.
create or replace function public.search_posts(search_text text, max_results integer default 40)
returns table (
  id uuid,
  user_id uuid,
  title text,
  content text,
  abstract text,
  post_type text,
  content_category text,
  keywords text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := (select auth.uid());
  typed text := left(coalesce(search_text, ''), 200);
  needle text := public.rg_search_text(typed);
  words tsquery := public.rg_tsquery(typed);
  pattern text := public.rg_like_pattern(public.rg_search_text(typed));
begin
  if me is null or needle = '' then
    return;
  end if;

  return query
  select f.post_id, f.post_user_id, f.post_title,
         case when f.readable then f.post_text end,
         f.post_abstract, f.post_kind, f.post_category, f.post_keywords, f.post_created_at
  from (
    select c.id as post_id, c.user_id as post_user_id, c.title as post_title, c.content as post_text,
           c.abstract as post_abstract, c.post_type as post_kind, c.content_category as post_category,
           c.keywords as post_keywords, c.created_at as post_created_at,
           r.readable,
           (public.rg_post_fields(c.title, c.abstract, c.keywords, c.post_type, c.content_category) like pattern
            or (r.readable and public.rg_post_text(c.content) like pattern)) as has_text,
           -- The full text only counts for readers who may read it.
           coalesce(ts_rank_cd(case when r.readable
                                    then public.rg_post_document(c.title, c.abstract, c.keywords, c.post_type,
                                           c.content_category) || public.rg_post_text_document(c.content)
                                    else public.rg_post_document(c.title, c.abstract, c.keywords, c.post_type,
                                           c.content_category) end, words), 0) as word_rank,
           ((words is not null
             and (public.rg_post_document(c.title, c.abstract, c.keywords, c.post_type, c.content_category) @@ words
                  or (r.readable
                      and (public.rg_post_document(c.title, c.abstract, c.keywords, c.post_type, c.content_category)
                           || public.rg_post_text_document(c.content)) @@ words)))
            or public.rg_post_fields(c.title, c.abstract, c.keywords, c.post_type, c.content_category) like pattern
            or (r.readable and public.rg_post_text(c.content) like pattern)) as matches
    from public.contents c
    cross join lateral (
      select public.can_read_post_text(c.user_id, c.visibility_mode, c.id) as readable
    ) r
    where (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = me)
      and not exists (select 1 from public.hidden_posts h
                      where h.user_id = me and h.content_id = c.id)
      -- Candidates, found through the search indexes.
      and ((words is not null
            and (public.rg_post_document(c.title, c.abstract, c.keywords, c.post_type, c.content_category)
                 || public.rg_post_text_document(c.content)) @@ words)
           or public.rg_post_fields(c.title, c.abstract, c.keywords, c.post_type, c.content_category) like pattern
           or public.rg_post_text(c.content) like pattern)
  ) f
  where f.matches
  order by f.has_text desc, f.word_rank desc, f.post_created_at desc nulls last, f.post_id
  limit least(greatest(coalesce(max_results, 40), 1), 100);
end;
$$;

revoke all on function public.search_posts(text, integer) from public, anon;
grant execute on function public.search_posts(text, integer) to authenticated, service_role;

-- ============================================================================
-- 3. Terms of Service and Privacy Policy
-- ============================================================================
-- Who accepted which version, and when. Kept apart from profiles so other
-- people cannot read it. The version is the date on /terms and /privacy, and
-- must match TERMS_VERSION in lib/legal.ts.

create or replace function public.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-10-16'::text;
$$;

revoke all on function public.current_terms_version() from public, anon;
grant execute on function public.current_terms_version() to authenticated, service_role;

create table if not exists public.user_consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at timestamptz not null default now(),
  -- The person confirmed being 18 or older when accepting.
  age_confirmed boolean not null default false
);
alter table public.user_consents add column if not exists age_confirmed boolean not null default false;

alter table public.user_consents enable row level security;
revoke all on public.user_consents from public, anon, authenticated;
grant select on public.user_consents to authenticated;
grant all on public.user_consents to service_role;

drop policy if exists "consents: read own" on public.user_consents;
create policy "consents: read own" on public.user_consents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Someone who signed up before the Terms existed (or before a new version)
-- accepts them once, from the notice the app shows, confirming their age.
drop function if exists public.accept_terms(text);
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
    raise exception 'ResearchGram is for people aged 18 or older. Confirm your age to continue.' using errcode = 'P0001';
  end if;

  insert into public.user_consents as uc (user_id, terms_version, accepted_at, age_confirmed)
  values (me, p_version, now(), true)
  on conflict (user_id) do update
    set terms_version = excluded.terms_version, accepted_at = excluded.accepted_at, age_confirmed = true
  returning uc.accepted_at into saved;

  return saved;
end;
$$;

revoke all on function public.accept_terms(text, boolean) from public, anon;
grant execute on function public.accept_terms(text, boolean) to authenticated, service_role;

-- New accounts: the sign-up form sends the version and the age confirmation
-- with the account details, and the consent is stored with the profile.
-- (Same as before otherwise: the profile comes from the sign-up details.)
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

  if new.raw_user_meta_data ->> 'terms_version' = public.current_terms_version()
     and lower(coalesce(new.raw_user_meta_data ->> 'age_confirmed', '')) = 'true' then
    insert into public.user_consents (user_id, terms_version, accepted_at, age_confirmed)
    values (new.id, public.current_terms_version(), now(), true)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ============================================================================
-- 4. Error log
-- ============================================================================
-- When something breaks in someone's browser or on the server, the app sends a
-- short report: what went wrong, on which page (without the part after "?"),
-- which browser. No post or message text, no user id. The same error on the
-- same page is one row with a counter. Admins see the list in /admin and mark
-- errors as fixed. Rows not seen for 30 days are deleted.
--
-- Anyone can send a report (pages before login too), so the database keeps
-- little and limits the rest: email addresses, ids, sign-in tokens and the part
-- of a web address after "?" are blanked out; texts are cut short; at most 200
-- new kinds of error an hour (100 from people who are not signed in) and 2,500
-- rows in all (2,000 for people who are not signed in).

create table if not exists public.error_reports (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  source text not null check (source in ('browser', 'server')),
  message text not null,
  stack text,
  path text,
  digest text,
  user_agent text,
  signed_in boolean not null default false,
  occurrences integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create unique index if not exists error_reports_open_fingerprint_idx
  on public.error_reports (fingerprint) where resolved_at is null;
create index if not exists error_reports_resolved_by_idx on public.error_reports (resolved_by);
-- No index on the times: the table stays small (see the limits above), and a
-- repeat then only updates the row in place.
drop index if exists public.error_reports_last_seen_idx;
drop index if exists public.error_reports_first_seen_idx;

alter table public.error_reports enable row level security;
revoke all on public.error_reports from public, anon, authenticated;
grant all on public.error_reports to service_role;

-- Personal details that can turn up in error texts: sign-in tokens, email
-- addresses, ids, and the part of a web address after "?" (codes, tokens).
create or replace function public.rg_redact(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(coalesce(value, ''),
                 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*)?', '[token]', 'g'),
               '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+', '[email]', 'g'),
             '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}', ':id', 'g'),
           '\?[^[:space:])''":#]+', '', 'g');
$$;

revoke all on function public.rg_redact(text) from public, anon, authenticated;

-- Called by the app, signed in or not. Never fails: a broken error report must
-- not cause a second error.
create or replace function public.report_error(
  p_source text,
  p_message text,
  p_stack text default null,
  p_path text default null,
  p_digest text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  clean_message text;
  clean_path text;
  key text;
  new_kinds integer;
  new_kinds_signed_out integer;
  all_rows integer;
begin
  if p_source is null or p_source not in ('browser', 'server') then
    return;
  end if;

  -- Short texts (counted in characters, so even unusual characters keep a row
  -- small), without line breaks in the message and without personal details.
  clean_message := btrim(left(public.rg_redact(
    regexp_replace(left(coalesce(p_message, ''), 2000), '[[:cntrl:]]+', ' ', 'g')), 300));
  clean_path := left(public.rg_redact(
    split_part(split_part(btrim(left(coalesce(p_path, ''), 1000)), '?', 1), '#', 1)), 200);

  if clean_message = '' then
    return;
  end if;

  if clean_path !~ '^/' then
    clean_path := '';
  end if;

  -- One report a second per signed-in person.
  if me is not null and not public.take_rate_limit('report_error', interval '1 second') then
    return;
  end if;

  -- Rows not seen for 30 days go (the Privacy Policy says so).
  delete from public.error_reports where last_seen < now() - interval '30 days';

  key := md5(p_source || '|' || clean_message || '|' || clean_path);

  update public.error_reports
     set occurrences = least(occurrences, 2000000000) + 1,
         last_seen = now(),
         signed_in = signed_in or me is not null
   where fingerprint = key and resolved_at is null;

  if found then
    return;
  end if;

  -- A new kind of error. One at a time, so the limits hold when many arrive at once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.report_error'));

  select count(*) filter (where first_seen > now() - interval '1 hour'),
         count(*) filter (where first_seen > now() - interval '1 hour' and not signed_in),
         count(*)
    into new_kinds, new_kinds_signed_out, all_rows
    from public.error_reports;

  if new_kinds >= 200
     or all_rows >= 2500
     or (me is null and (new_kinds_signed_out >= 100 or all_rows >= 2000)) then
    return;
  end if;

  insert into public.error_reports (fingerprint, source, message, stack, path, digest, user_agent, signed_in)
  values (key, p_source, clean_message,
          nullif(left(public.rg_redact(left(coalesce(p_stack, ''), 6000)), 2000), ''),
          nullif(clean_path, ''),
          nullif(left(btrim(coalesce(p_digest, '')), 64), ''),
          nullif(left(btrim(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]]+', ' ', 'g')), 300), ''),
          me is not null)
  on conflict (fingerprint) where resolved_at is null do update
    set occurrences = least(public.error_reports.occurrences, 2000000000) + 1, last_seen = now();
exception
  when others then
    return;
end;
$$;

revoke all on function public.report_error(text, text, text, text, text, text) from public;
grant execute on function public.report_error(text, text, text, text, text, text) to anon, authenticated, service_role;

-- Admins: the newest errors first, and how many are open in all. Expired rows
-- are deleted first, so nothing older than 30 days is shown or kept.
drop function if exists public.admin_error_reports(boolean, integer);
create function public.admin_error_reports(p_include_fixed boolean default false, p_limit integer default 50)
returns table (
  id bigint,
  source text,
  message text,
  stack text,
  path text,
  digest text,
  user_agent text,
  signed_in boolean,
  occurrences integer,
  first_seen timestamptz,
  last_seen timestamptz,
  resolved_at timestamptz,
  open_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  delete from public.error_reports x where x.last_seen < now() - interval '30 days';

  return query
  select e.id, e.source, e.message, e.stack, e.path, e.digest, e.user_agent, e.signed_in,
         e.occurrences, e.first_seen, e.last_seen, e.resolved_at,
         (select count(*) from public.error_reports o where o.resolved_at is null)
  from public.error_reports e
  where coalesce(p_include_fixed, false) or e.resolved_at is null
  order by e.resolved_at is not null, e.last_seen desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.admin_error_reports(boolean, integer) from public, anon;
grant execute on function public.admin_error_reports(boolean, integer) to authenticated, service_role;

create or replace function public.admin_resolve_error(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  update public.error_reports
     set resolved_at = now(), resolved_by = (select auth.uid())
   where id = p_id and resolved_at is null;

  if not found then
    raise exception 'This error was already marked as fixed.' using errcode = 'P0002';
  end if;

  perform public.write_audit('error.fixed', 'error', p_id::text, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_resolve_error(bigint) from public, anon;
grant execute on function public.admin_resolve_error(bigint) to authenticated, service_role;

-- ============================================================================
-- 5. Data export includes the consent record
-- ============================================================================
-- Same as Phase 4, plus "consent": which Terms version was accepted, and when.

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

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated, service_role;

reset lock_timeout;
