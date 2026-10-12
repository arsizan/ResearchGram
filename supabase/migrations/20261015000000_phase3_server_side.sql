-- ResearchGram Phase 3: rules and work that belong on the server (15 Oct 2026).
-- Run after 20261014000000_conversation_summaries.sql. Safe to run more than once.
-- Works with the old app code too, so it can run before the new code goes live.
-- 20261015010000_close_post_text.sql (run after the new code is live) then
-- closes the content column.
--
--   1. readable_post_texts(): full text only for readers allowed to see it (audit RG-07)
--   2. Paper access requests start as pending and cannot be re-pointed
--   3. Research metrics are fetched from OpenAlex by the database        (audit RG-09)
--   4. Search, suggestions and recommendations run in the database       (audit RG-06)

-- ============================================================================
-- 1. Full text of abstract-only posts stays on the server (RG-07)
-- ============================================================================
-- The app reads a post's full text through readable_post_texts(), which returns
-- it only to readers allowed to see it: public posts, your own posts, and
-- abstract-only posts whose owner approved your access request.
-- 20261015010000_close_post_text.sql then stops the `content` column from being
-- read directly.

-- True when the signed-in user may read the full text of this post.
create or replace function public.can_read_post_text(post_owner uuid, post_visibility text, post_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select post_owner = (select auth.uid())
      or coalesce(post_visibility, 'public') = 'public'
      or (post_visibility = 'abstract_only' and exists (
            select 1 from public.paper_access_requests par
             where par.content_id = post_id
               and par.requester_id = (select auth.uid())
               and par.status = 'approved'));
$$;

create or replace function public.readable_post_texts(content_ids uuid[])
returns table (content_id uuid, content text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.content
  from public.contents c
  where c.id = any(content_ids)
    and public.can_read_post_text(c.user_id, c.visibility_mode, c.id);
$$;

revoke all on function public.can_read_post_text(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.readable_post_texts(uuid[]) from public, anon;
grant execute on function public.readable_post_texts(uuid[]) to authenticated, service_role;

-- ============================================================================
-- 2. Paper access requests (found while doing RG-07)
-- ============================================================================
-- Before: a requester could insert a request that was already "approved" and
-- read a restricted paper at once, and the owner could move a request to
-- someone else's paper. Now a request starts as pending, and the owner can only
-- change its status and the matching dates.

drop policy if exists "users can request paper access" on public.paper_access_requests;
drop policy if exists "paper access: request as pending" on public.paper_access_requests;
create policy "paper access: request as pending" on public.paper_access_requests
  for insert to authenticated
  with check (requester_id = (select auth.uid())
              and owner_id <> (select auth.uid())
              and status = 'pending'
              and exists (select 1 from public.contents c
                          where c.id = paper_access_requests.content_id
                            and c.user_id = paper_access_requests.owner_id));

revoke update on public.paper_access_requests from anon, authenticated;
grant update (status, approved_at, rejected_at, updated_at) on public.paper_access_requests to authenticated;

-- ============================================================================
-- 3. Research metrics come from OpenAlex, fetched by the database (RG-09)
-- ============================================================================
-- Before: the browser fetched the numbers and wrote them into the profile, so
-- anyone could give themselves any citation count or h-index. Now writes from
-- the app keep the stored values, and sync_my_research_metrics() fetches them
-- from OpenAlex itself and saves them.

create extension if not exists http with schema extensions;

create or replace function public.profiles_keep_research_metrics()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.external_publication_count := 0;
      new.external_citation_count := 0;
      new.external_h_index := 0;
      new.external_metrics_synced_at := null;
    else
      new.external_publication_count := old.external_publication_count;
      new.external_citation_count := old.external_citation_count;
      new.external_h_index := old.external_h_index;
      new.external_metrics_synced_at := old.external_metrics_synced_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_research_metrics on public.profiles;
create trigger profiles_keep_research_metrics
  before insert or update on public.profiles
  for each row execute function public.profiles_keep_research_metrics();

revoke all on function public.profiles_keep_research_metrics() from public, anon, authenticated;

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

  select p.external_metrics_synced_at into last_sync
  from public.profiles p where p.id = me;

  if last_sync is not null and last_sync > now() - interval '30 seconds' then
    raise exception 'Metrics were synced a moment ago. Try again in a minute.' using errcode = 'P0001';
  end if;

  perform set_config('http.timeout_msec', '6000', true);
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

  if response.status = 404 then
    raise exception 'No OpenAlex author profile was found for this ORCID iD.' using errcode = 'P0002';
  end if;

  if response.status is distinct from 200 then
    raise exception 'OpenAlex did not answer. Try again later.' using errcode = 'P0001';
  end if;

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
-- 4. Search, suggestions and recommendations run in the database (RG-06)
-- ============================================================================
-- Before: the Search page downloaded 300 profiles and 300 posts, and the
-- Recommendations page every profile, and filtered them in the browser. Now
-- the database does the matching and sends only the results. The rules are the
-- ones the pages used.

-- Lower case, punctuation to spaces, single spaces (Search page rules).
create or replace function public.rg_search_text(value text)
returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]_[:space:]]', ' ', 'g'),
           '[[:space:]]+', ' ', 'g'));
$$;

-- Distinct words of 2+ characters, in order of first appearance.
create or replace function public.rg_search_tokens(value text)
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(s.token order by s.first_pos), '{}'::text[])
  from (
    select x.token, min(x.pos) as first_pos
    from unnest(string_to_array(public.rg_search_text(value), ' ')) with ordinality as x(token, pos)
    where length(x.token) >= 2
    group by x.token
  ) s;
$$;

-- a-z and 0-9 only, everything else to spaces (Recommendations page rules).
create or replace function public.rg_keyword_text(value text)
returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(value, '')), '[_/,-]', ' ', 'g'),
             '[^a-z0-9[:space:]]', ' ', 'g'),
           '[[:space:]]+', ' ', 'g'));
$$;

-- Distinct keywords of 3+ characters without stop words, in order of first appearance.
create or replace function public.rg_keywords(value text)
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(s.token order by s.first_pos), '{}'::text[])
  from (
    select x.token, min(x.pos) as first_pos
    from unnest(string_to_array(public.rg_keyword_text(value), ' ')) with ordinality as x(token, pos)
    where length(x.token) >= 3
      and x.token <> all (array[
        'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is',
        'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'we', 'will',
        'research', 'project', 'paper', 'study', 'work'])
    group by x.token
  ) s;
$$;

-- People whose profile text contains the query (Search page).
create or replace function public.search_researchers(search_text text, max_results integer default 40)
returns setof public.profiles
language sql stable set search_path = ''
as $$
  select p.*
  from (select public.rg_search_text(search_text) as needle) q
  cross join public.profiles p
  where q.needle <> ''
    and p.id <> (select auth.uid())
    and strpos(
          public.rg_search_text(concat_ws(' ', p.full_name, p.email, p.department, p.skills,
            p.interests, p.user_role, p.academic_level, p.batch, p.session, p.current_position,
            p.company_or_institution, p.research_area, p.expertise, p.bio)),
          q.needle) > 0
  order by p.profile_completion_score desc nulls last, p.full_name nulls last, p.id
  limit least(greatest(coalesce(max_results, 40), 1), 100);
$$;

-- The researcher directory: everyone, or those whose name, email, department,
-- skills, interests or bio contain the typed text (as the page matched it
-- before: lower case, punctuation kept, so "C++" finds C++ and not every "c").
-- By name, one page at a time (skip_results = how many are already on screen).
drop function if exists public.browse_researchers(text, integer);

create or replace function public.browse_researchers(
  search_text text default '',
  max_results integer default 30,
  skip_results integer default 0
)
returns setof public.profiles
language sql stable set search_path = ''
as $$
  select p.*
  from (select lower(btrim(coalesce(search_text, ''), E' \t\r\n')) as needle) q
  cross join public.profiles p
  where q.needle = ''
     or strpos(
          lower(concat_ws(' ', nullif(p.full_name, ''), nullif(p.email, ''), nullif(p.department, ''),
            nullif(p.skills, ''), nullif(p.interests, ''), nullif(p.bio, ''))),
          q.needle) > 0
  order by p.full_name nulls last, p.id
  offset greatest(coalesce(skip_results, 0), 0)
  limit least(greatest(coalesce(max_results, 30), 1), 100);
$$;

-- Posts whose title, abstract, keywords or readable text contain the query,
-- newest first. Private posts of others and posts you hid are left out.
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
language sql stable security definer set search_path = ''
as $$
  select c.id, c.user_id, c.title,
         case when r.readable then c.content end,
         c.abstract, c.post_type, c.content_category, c.keywords, c.created_at
  from (select public.rg_search_text(search_text) as needle) q
  cross join public.contents c
  cross join lateral (
    select public.can_read_post_text(c.user_id, c.visibility_mode, c.id) as readable
  ) r
  where (select auth.uid()) is not null
    and q.needle <> ''
    and (coalesce(c.visibility_mode, 'public') <> 'private' or c.user_id = (select auth.uid()))
    and not exists (select 1 from public.hidden_posts h
                    where h.user_id = (select auth.uid()) and h.content_id = c.id)
    and strpos(
          public.rg_search_text(concat_ws(' ', c.title, case when r.readable then c.content end,
            c.abstract, c.keywords, c.post_type, c.content_category)),
          q.needle) > 0
  order by c.created_at desc nulls last, c.id
  limit least(greatest(coalesce(max_results, 40), 1), 100);
$$;

-- "Suggested researchers" on the Search page: shared interests, recent
-- searches, department, role, mentorship and profile completeness.
create or replace function public.suggest_researchers(max_results integer default 8)
returns table (
  id uuid,
  full_name text,
  email text,
  department text,
  profile_pic_url text,
  bio text,
  skills text,
  interests text,
  user_role text,
  academic_level text,
  batch text,
  session text,
  graduation_year integer,
  current_position text,
  company_or_institution text,
  research_area text,
  expertise text,
  mentorship_available boolean,
  profile_completion_score integer,
  suggestion_score integer,
  shared_interest_count integer,
  search_match_count integer,
  same_department boolean
)
language sql stable set search_path = ''
as $$
  with me as (
    select p.id, p.department, p.user_role,
           public.rg_search_tokens(concat_ws(' ', p.skills, p.interests, p.research_area, p.expertise)) as tokens
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  history as (
    select public.rg_search_tokens(string_agg(s.query, ' ')) as tokens
    from (
      select e.query
      from public.search_events e
      where e.user_id = (select auth.uid()) and coalesce(e.query, '') <> ''
      order by e.created_at desc
      limit 10
    ) s
  ),
  scored as (
    select p.*,
           (select count(*) from unnest(t.tokens) x where x = any(me.tokens))::integer as shared,
           (select count(*) from unnest(t.tokens) x where x = any(history.tokens))::integer as searched,
           (coalesce(me.department, '') <> '' and coalesce(p.department, '') <> ''
             and lower(me.department) = lower(p.department)) as same_dept,
           me.user_role as my_role
    from public.profiles p
    cross join me
    cross join history
    cross join lateral (
      select public.rg_search_tokens(concat_ws(' ', p.skills, p.interests, p.research_area,
               p.expertise, p.bio)) as tokens
    ) t
    where p.id <> me.id
  ),
  ranked as (
    select s.*,
           (s.shared * 12
            + s.searched * 8
            + case when s.same_dept then 20 else 0 end
            + case when s.my_role = 'student' and s.user_role in ('alumni', 'faculty') then 18 else 0 end
            + case when s.mentorship_available then 12 else 0 end
            + case when coalesce(s.profile_completion_score, 0) >= 70 then 8 else 0 end
            + case when coalesce(s.current_position, '') <> '' or coalesce(s.company_or_institution, '') <> ''
                   then 5 else 0 end)::integer as score
    from scored s
  )
  select r.id, r.full_name, r.email, r.department, r.profile_pic_url, r.bio, r.skills,
         r.interests, r.user_role, r.academic_level, r.batch, r.session, r.graduation_year,
         r.current_position, r.company_or_institution, r.research_area, r.expertise,
         r.mentorship_available, r.profile_completion_score,
         r.score, r.shared, r.searched, r.same_dept
  from ranked r
  where r.score > 0
  order by r.score desc, r.full_name nulls last, r.id
  limit least(greatest(coalesce(max_results, 8), 1), 50);
$$;

-- Collaborators for one of my posts (Recommendations page): keywords of the
-- post that appear in a researcher's profile, skills and interests,
-- department and how complete the profile is.
create or replace function public.recommend_collaborators(post_id uuid, max_results integer default 12)
returns table (
  id uuid,
  email text,
  full_name text,
  department text,
  skills text,
  interests text,
  bio text,
  profile_pic_url text,
  score integer,
  matched_keywords text[],
  skill_keywords text[],
  same_department boolean,
  detailed_bio boolean
)
language sql stable security definer set search_path = ''
as $$
  with post as (
    select public.rg_keywords(concat_ws(' ', c.title, c.content, c.post_type)) as keywords
    from public.contents c
    where c.id = post_id and c.user_id = (select auth.uid())
  ),
  me as (
    select public.rg_keyword_text(p.department) as dept
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  matched as (
    select p.id, p.email, p.full_name, p.department, p.skills, p.interests, p.bio, p.profile_pic_url,
           array(select x.k from unnest(post.keywords) with ordinality as x(k, n)
                 where x.k = any(kw.all_words) order by x.n) as words,
           array(select x.k from unnest(post.keywords) with ordinality as x(k, n)
                 where x.k = any(kw.skill_words) order by x.n) as skill_words,
           (coalesce(me.dept, '') <> '' and public.rg_keyword_text(p.department) = me.dept) as same_dept,
           length(regexp_replace(coalesce(p.bio, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')) > 20 as long_bio,
           regexp_replace(coalesce(p.skills, ''), '[[:space:]]', '', 'g') <> '' as has_skills,
           regexp_replace(coalesce(p.interests, ''), '[[:space:]]', '', 'g') <> '' as has_interests
    from public.profiles p
    cross join post
    left join me on true
    cross join lateral (
      select public.rg_keywords(concat_ws(' ', p.full_name, p.department, p.skills, p.interests, p.bio)) as all_words,
             public.rg_keywords(p.skills) || public.rg_keywords(p.interests) as skill_words
    ) kw
    where p.id <> (select auth.uid())
  )
  select m.id, m.email, m.full_name, m.department, m.skills, m.interests, m.bio, m.profile_pic_url,
         least(96,
           20
           + case when cardinality(m.words) > 0 then least(cardinality(m.words) * 12, 45) else 0 end
           + case when cardinality(m.skill_words) > 0 then least(cardinality(m.skill_words) * 10, 25) else 0 end
           + case when m.same_dept then 8 else 0 end
           + case when m.long_bio then 5 else 0 end
           + case when m.has_skills then 5 else 0 end
           + case when m.has_interests then 5 else 0 end)::integer as score,
         m.words, m.skill_words, m.same_dept, m.long_bio
  from matched m
  order by 9 desc, m.full_name nulls last, m.id
  limit least(greatest(coalesce(max_results, 12), 1), 50);
$$;

revoke all on function public.rg_search_text(text) from public, anon;
revoke all on function public.rg_search_tokens(text) from public, anon;
revoke all on function public.rg_keyword_text(text) from public, anon;
revoke all on function public.rg_keywords(text) from public, anon;
revoke all on function public.search_researchers(text, integer) from public, anon;
revoke all on function public.browse_researchers(text, integer, integer) from public, anon;
revoke all on function public.search_posts(text, integer) from public, anon;
revoke all on function public.suggest_researchers(integer) from public, anon;
revoke all on function public.recommend_collaborators(uuid, integer) from public, anon;
grant execute on function public.rg_search_text(text) to authenticated, service_role;
grant execute on function public.rg_search_tokens(text) to authenticated, service_role;
grant execute on function public.rg_keyword_text(text) to authenticated, service_role;
grant execute on function public.rg_keywords(text) to authenticated, service_role;
grant execute on function public.search_researchers(text, integer) to authenticated, service_role;
grant execute on function public.browse_researchers(text, integer, integer) to authenticated, service_role;
grant execute on function public.search_posts(text, integer) to authenticated, service_role;
grant execute on function public.suggest_researchers(integer) to authenticated, service_role;
grant execute on function public.recommend_collaborators(uuid, integer) to authenticated, service_role;
