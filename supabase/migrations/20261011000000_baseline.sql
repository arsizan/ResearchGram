-- Baseline: ResearchGram schema as found on 2026-10-11 (Sydney project).
-- Generated from claude/db-report.sql output. Schema only, no data.

create table public."comments" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "user_id" uuid not null,
  "comment_text" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."content_attachments" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "file_url" text not null,
  "storage_path" text not null,
  "original_name" text not null,
  "mime_type" text,
  "file_ext" text,
  "file_size" bigint,
  "attachment_type" text not null,
  "created_at" timestamp with time zone default now(),
  "bucket_name" text default 'content-files'::text,
  "access_level" text default 'public'::text,
  "file_role" text default 'attachment'::text,
  "is_full_paper" boolean default false,
  "is_preview_file" boolean default false
);
create table public."content_authors" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "profile_id" uuid,
  "manual_name" text,
  "author_order" integer default 1 not null,
  "author_role" text default 'co_author'::text not null,
  "created_at" timestamp with time zone default now()
);
create table public."contents" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid default gen_random_uuid() not null,
  "content" text,
  "created_at" timestamp with time zone default now(),
  "title" text,
  "post_type" text,
  "content_category" text default 'general_post'::text,
  "abstract" text,
  "visibility_mode" text default 'public'::text,
  "full_paper_access_mode" text default 'public'::text,
  "allow_full_paper_request" boolean default false,
  "doi" text,
  "publication_status" text default 'draft'::text,
  "publisher_name" text,
  "publication_date" date,
  "keywords" text,
  "updated_at" timestamp with time zone default now()
);
create table public."conversation_members" (
  "id" uuid default gen_random_uuid() not null,
  "conversation_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'member'::text not null,
  "last_read_at" timestamp with time zone default now(),
  "muted" boolean default false not null,
  "joined_at" timestamp with time zone default now()
);
create table public."conversations" (
  "id" uuid default gen_random_uuid() not null,
  "request_id" uuid,
  "content_id" uuid,
  "participant_one_id" uuid,
  "participant_two_id" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "conversation_type" text default 'direct'::text not null,
  "title" text,
  "workspace_id" uuid,
  "created_by" uuid,
  "last_message_at" timestamp with time zone default now()
);
create table public."hidden_posts" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now()
);
create table public."messages" (
  "id" uuid default gen_random_uuid() not null,
  "conversation_id" uuid not null,
  "sender_id" uuid not null,
  "message_text" text,
  "created_at" timestamp with time zone default now(),
  "reply_to_message_id" uuid,
  "is_deleted" boolean default false not null,
  "deleted_at" timestamp with time zone,
  "pinned_at" timestamp with time zone,
  "pinned_by" uuid,
  "updated_at" timestamp with time zone default now(),
  "read_at" timestamp with time zone,
  "body" text
);
create table public."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "recipient_id" uuid not null,
  "actor_id" uuid,
  "notification_type" text not null,
  "title" text not null,
  "body" text,
  "link_url" text,
  "content_id" uuid,
  "request_id" uuid,
  "request_kind" text,
  "is_read" boolean default false not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now(),
  "read_at" timestamp with time zone
);
create table public."paper_access_requests" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "requester_id" uuid not null,
  "owner_id" uuid not null,
  "reason" text,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "approved_at" timestamp with time zone,
  "rejected_at" timestamp with time zone
);
create table public."paper_extracted_images" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "attachment_id" uuid,
  "image_url" text not null,
  "storage_path" text not null,
  "page_number" integer,
  "image_order" integer default 1 not null,
  "created_at" timestamp with time zone default now()
);
create table public."post_reports" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "reporter_id" uuid not null,
  "reason" text not null,
  "details" text,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."profile_requests" (
  "id" uuid default gen_random_uuid() not null,
  "requester_id" uuid not null,
  "receiver_id" uuid not null,
  "request_type" text default 'connection'::text not null,
  "message" text,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."profile_view_events" (
  "id" uuid default gen_random_uuid() not null,
  "viewer_id" uuid not null,
  "viewed_profile_id" uuid not null,
  "source" text default 'search'::text not null,
  "created_at" timestamp with time zone default now()
);
create table public."profiles" (
  "id" uuid default auth.uid() not null,
  "email" text not null,
  "full_name" text,
  "department" text,
  "skills" text,
  "interests" text,
  "bio" text,
  "profile_pic_url" text,
  "cover_photo_url" text,
  "user_role" text default 'student'::text,
  "academic_level" text,
  "expertise" text,
  "mentorship_available" boolean default false,
  "office_hours" text,
  "batch" text,
  "session" text,
  "graduation_year" integer,
  "current_position" text,
  "company_or_institution" text,
  "research_area" text,
  "onboarding_completed" boolean default false,
  "profile_completion_score" integer default 0,
  "profile_completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone default now(),
  "orcid_id" text,
  "google_scholar_url" text,
  "researchgate_url" text,
  "personal_website_url" text,
  "external_publication_count" integer default 0,
  "external_citation_count" integer default 0,
  "external_h_index" integer default 0,
  "external_metrics_synced_at" timestamp with time zone
);
create table public."research_requests" (
  "id" uuid default gen_random_uuid() not null,
  "content_id" uuid not null,
  "requester_id" uuid not null,
  "receiver_id" uuid not null,
  "request_type" text default 'collaboration'::text not null,
  "message" text,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."saved_posts" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "content_id" uuid not null,
  "created_at" timestamp with time zone default now()
);
create table public."search_events" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "query" text not null,
  "search_type" text default 'global'::text not null,
  "created_at" timestamp with time zone default now()
);
create table public."user_connections" (
  "id" uuid default gen_random_uuid() not null,
  "user_one_id" uuid not null,
  "user_two_id" uuid not null,
  "created_at" timestamp with time zone default now()
);
create table public."workspace_files" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "uploaded_by" uuid not null,
  "file_url" text not null,
  "storage_path" text not null,
  "original_name" text not null,
  "mime_type" text,
  "file_ext" text,
  "file_size" bigint,
  "file_category" text default 'research_file'::text not null,
  "created_at" timestamp with time zone default now()
);
create table public."workspace_meetings" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "created_by" uuid not null,
  "title" text not null,
  "provider" text default 'jitsi'::text not null,
  "room_name" text not null,
  "meeting_url" text not null,
  "starts_at" timestamp with time zone,
  "created_at" timestamp with time zone default now()
);
create table public."workspace_members" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'member'::text not null,
  "created_at" timestamp with time zone default now()
);
create table public."workspace_milestones" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "created_by" uuid,
  "title" text not null,
  "description" text,
  "status" text default 'planned'::text not null,
  "due_date" date,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."workspace_recordings" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "meeting_id" uuid,
  "recorded_by" uuid not null,
  "title" text not null,
  "file_name" text not null,
  "file_type" text default 'video/webm'::text,
  "duration_seconds" integer,
  "saved_location_note" text,
  "created_at" timestamp with time zone default now()
);
create table public."workspace_tasks" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "title" text not null,
  "description" text,
  "status" text default 'todo'::text not null,
  "priority" text default 'medium'::text not null,
  "due_date" date,
  "assigned_to" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."workspace_updates" (
  "id" uuid default gen_random_uuid() not null,
  "workspace_id" uuid not null,
  "author_id" uuid not null,
  "update_type" text default 'note'::text not null,
  "body" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."workspaces" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid not null,
  "title" text not null,
  "description" text,
  "research_area" text,
  "status" text default 'active'::text not null,
  "due_date" date,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "workspace_type" text default 'personal'::text not null
);
alter table public."comments" add constraint "comments_pkey" PRIMARY KEY (id);
alter table public."content_attachments" add constraint "content_attachments_access_level_check" CHECK ((access_level = ANY (ARRAY['public'::text, 'restricted'::text])));
alter table public."content_attachments" add constraint "content_attachments_pkey" PRIMARY KEY (id);
alter table public."content_authors" add constraint "content_authors_pkey" PRIMARY KEY (id);
alter table public."content_authors" add constraint "content_authors_profile_or_manual_check" CHECK (((profile_id IS NOT NULL) OR (manual_name IS NOT NULL)));
alter table public."contents" add constraint "contents_content_category_check" CHECK ((content_category = ANY (ARRAY['general_post'::text, 'research_paper'::text, 'article'::text, 'dataset'::text, 'presentation'::text, 'code_project'::text, 'question'::text, 'announcement'::text])));
alter table public."contents" add constraint "contents_full_paper_access_mode_check" CHECK ((full_paper_access_mode = ANY (ARRAY['public'::text, 'request_required'::text, 'private'::text])));
alter table public."contents" add constraint "contents_pkey" PRIMARY KEY (id);
alter table public."contents" add constraint "contents_visibility_mode_check" CHECK ((visibility_mode = ANY (ARRAY['public'::text, 'abstract_only'::text, 'private'::text])));
alter table public."conversation_members" add constraint "conversation_members_conversation_id_user_id_key" UNIQUE (conversation_id, user_id);
alter table public."conversation_members" add constraint "conversation_members_pkey" PRIMARY KEY (id);
alter table public."conversations" add constraint "conversations_conversation_type_check" CHECK ((conversation_type = ANY (ARRAY['direct'::text, 'collaboration'::text, 'workspace_group'::text])));
alter table public."conversations" add constraint "conversations_pkey" PRIMARY KEY (id);
alter table public."conversations" add constraint "conversations_request_id_key" UNIQUE (request_id);
alter table public."hidden_posts" add constraint "hidden_posts_content_id_user_id_key" UNIQUE (content_id, user_id);
alter table public."hidden_posts" add constraint "hidden_posts_pkey" PRIMARY KEY (id);
alter table public."messages" add constraint "messages_pkey" PRIMARY KEY (id);
alter table public."notifications" add constraint "notifications_notification_type_check" CHECK ((notification_type = ANY (ARRAY['collaboration_request'::text, 'profile_request'::text, 'paper_access_request'::text, 'request_accepted'::text, 'request_declined'::text, 'paper_access_approved'::text, 'paper_access_rejected'::text, 'comment'::text, 'system'::text])));
alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);
alter table public."paper_access_requests" add constraint "paper_access_requests_content_id_requester_id_key" UNIQUE (content_id, requester_id);
alter table public."paper_access_requests" add constraint "paper_access_requests_pkey" PRIMARY KEY (id);
alter table public."paper_access_requests" add constraint "paper_access_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public."paper_extracted_images" add constraint "paper_extracted_images_pkey" PRIMARY KEY (id);
alter table public."post_reports" add constraint "post_reports_content_id_reporter_id_key" UNIQUE (content_id, reporter_id);
alter table public."post_reports" add constraint "post_reports_pkey" PRIMARY KEY (id);
alter table public."post_reports" add constraint "post_reports_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text, 'action_taken'::text])));
alter table public."profile_requests" add constraint "profile_requests_pkey" PRIMARY KEY (id);
alter table public."profile_requests" add constraint "profile_requests_requester_id_receiver_id_request_type_key" UNIQUE (requester_id, receiver_id, request_type);
alter table public."profile_view_events" add constraint "profile_view_events_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."research_requests" add constraint "research_requests_content_requester_receiver_type_key" UNIQUE (content_id, requester_id, receiver_id, request_type);
alter table public."research_requests" add constraint "research_requests_pkey" PRIMARY KEY (id);
alter table public."saved_posts" add constraint "saved_posts_pkey" PRIMARY KEY (id);
alter table public."saved_posts" add constraint "saved_posts_user_id_content_id_key" UNIQUE (user_id, content_id);
alter table public."search_events" add constraint "search_events_pkey" PRIMARY KEY (id);
alter table public."user_connections" add constraint "user_connections_pkey" PRIMARY KEY (id);
alter table public."user_connections" add constraint "user_connections_user_one_id_user_two_id_key" UNIQUE (user_one_id, user_two_id);
alter table public."workspace_files" add constraint "workspace_files_pkey" PRIMARY KEY (id);
alter table public."workspace_meetings" add constraint "workspace_meetings_pkey" PRIMARY KEY (id);
alter table public."workspace_members" add constraint "workspace_members_pkey" PRIMARY KEY (id);
alter table public."workspace_members" add constraint "workspace_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text, 'collaborator'::text])));
alter table public."workspace_members" add constraint "workspace_members_workspace_id_user_id_key" UNIQUE (workspace_id, user_id);
alter table public."workspace_milestones" add constraint "workspace_milestones_pkey" PRIMARY KEY (id);
alter table public."workspace_milestones" add constraint "workspace_milestones_status_check" CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'completed'::text])));
alter table public."workspace_recordings" add constraint "workspace_recordings_pkey" PRIMARY KEY (id);
alter table public."workspace_tasks" add constraint "workspace_tasks_pkey" PRIMARY KEY (id);
alter table public."workspace_tasks" add constraint "workspace_tasks_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
alter table public."workspace_tasks" add constraint "workspace_tasks_status_check" CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'review'::text, 'completed'::text])));
alter table public."workspace_updates" add constraint "workspace_updates_pkey" PRIMARY KEY (id);
alter table public."workspaces" add constraint "workspaces_pkey" PRIMARY KEY (id);
alter table public."workspaces" add constraint "workspaces_workspace_type_check" CHECK ((workspace_type = ANY (ARRAY['personal'::text, 'shared'::text])));
alter table public."comments" add constraint "comments_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."comments" add constraint "comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."content_attachments" add constraint "content_attachments_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."content_authors" add constraint "content_authors_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."content_authors" add constraint "content_authors_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."contents" add constraint "contents_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public."conversation_members" add constraint "conversation_members_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
alter table public."conversation_members" add constraint "conversation_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."conversations" add constraint "conversations_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."conversations" add constraint "conversations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."conversations" add constraint "conversations_participant_one_id_fkey" FOREIGN KEY (participant_one_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."conversations" add constraint "conversations_participant_two_id_fkey" FOREIGN KEY (participant_two_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."conversations" add constraint "conversations_request_id_fkey" FOREIGN KEY (request_id) REFERENCES research_requests(id) ON DELETE CASCADE;
alter table public."conversations" add constraint "conversations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."hidden_posts" add constraint "hidden_posts_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."hidden_posts" add constraint "hidden_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
alter table public."messages" add constraint "messages_pinned_by_fkey" FOREIGN KEY (pinned_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."messages" add constraint "messages_reply_to_message_id_fkey" FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL;
alter table public."messages" add constraint "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."notifications" add constraint "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."notifications" add constraint "notifications_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."notifications" add constraint "notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."paper_access_requests" add constraint "paper_access_requests_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."paper_access_requests" add constraint "paper_access_requests_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."paper_access_requests" add constraint "paper_access_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."paper_extracted_images" add constraint "paper_extracted_images_attachment_id_fkey" FOREIGN KEY (attachment_id) REFERENCES content_attachments(id) ON DELETE CASCADE;
alter table public."paper_extracted_images" add constraint "paper_extracted_images_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."post_reports" add constraint "post_reports_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."post_reports" add constraint "post_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."profile_requests" add constraint "profile_requests_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."profile_requests" add constraint "profile_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."profile_view_events" add constraint "profile_view_events_viewed_profile_id_fkey" FOREIGN KEY (viewed_profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."profile_view_events" add constraint "profile_view_events_viewer_id_fkey" FOREIGN KEY (viewer_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."research_requests" add constraint "research_requests_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."research_requests" add constraint "research_requests_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."research_requests" add constraint "research_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."saved_posts" add constraint "saved_posts_content_id_fkey" FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
alter table public."saved_posts" add constraint "saved_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."search_events" add constraint "search_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."user_connections" add constraint "user_connections_user_one_id_fkey" FOREIGN KEY (user_one_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."user_connections" add constraint "user_connections_user_two_id_fkey" FOREIGN KEY (user_two_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_files" add constraint "workspace_files_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_files" add constraint "workspace_files_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspace_meetings" add constraint "workspace_meetings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_meetings" add constraint "workspace_meetings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspace_members" add constraint "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_members" add constraint "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspace_milestones" add constraint "workspace_milestones_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."workspace_milestones" add constraint "workspace_milestones_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspace_recordings" add constraint "workspace_recordings_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES workspace_meetings(id) ON DELETE SET NULL;
alter table public."workspace_recordings" add constraint "workspace_recordings_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_recordings" add constraint "workspace_recordings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspace_tasks" add constraint "workspace_tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."workspace_tasks" add constraint "workspace_tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."workspace_tasks" add constraint "workspace_tasks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspace_updates" add constraint "workspace_updates_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_updates" add constraint "workspace_updates_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
alter table public."workspaces" add constraint "workspaces_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX comments_content_id_created_at_idx ON public.comments USING btree (content_id, created_at);
CREATE INDEX content_attachments_content_id_idx ON public.content_attachments USING btree (content_id);
CREATE INDEX content_authors_content_id_idx ON public.content_authors USING btree (content_id);
CREATE INDEX content_authors_profile_id_idx ON public.content_authors USING btree (profile_id);
CREATE INDEX contents_created_at_idx ON public.contents USING btree (created_at DESC);
CREATE INDEX contents_user_id_created_at_idx ON public.contents USING btree (user_id, created_at DESC);
CREATE INDEX conversation_members_conversation_id_idx ON public.conversation_members USING btree (conversation_id);
CREATE INDEX conversation_members_user_id_idx ON public.conversation_members USING btree (user_id);
CREATE INDEX conversation_members_user_conversation_idx ON public.conversation_members USING btree (user_id, conversation_id);
CREATE INDEX conversations_participant_one_idx ON public.conversations USING btree (participant_one_id);
CREATE INDEX conversations_participant_two_idx ON public.conversations USING btree (participant_two_id);
CREATE INDEX conversations_type_idx ON public.conversations USING btree (conversation_type);
CREATE INDEX conversations_workspace_id_idx ON public.conversations USING btree (workspace_id);
CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at DESC);
CREATE UNIQUE INDEX conversations_workspace_group_unique_idx ON public.conversations USING btree (workspace_id) WHERE ((conversation_type = 'workspace_group'::text) AND (workspace_id IS NOT NULL));
CREATE UNIQUE INDEX conversations_direct_pair_unique ON public.conversations USING btree (LEAST(participant_one_id, participant_two_id), GREATEST(participant_one_id, participant_two_id)) WHERE ((conversation_type = 'direct'::text) AND (participant_one_id IS NOT NULL) AND (participant_two_id IS NOT NULL));
CREATE INDEX hidden_posts_content_id_idx ON public.hidden_posts USING btree (content_id);
CREATE INDEX hidden_posts_user_id_idx ON public.hidden_posts USING btree (user_id);
CREATE INDEX hidden_posts_user_content_idx ON public.hidden_posts USING btree (user_id, content_id);
CREATE INDEX messages_reply_to_idx ON public.messages USING btree (reply_to_message_id);
CREATE INDEX messages_pinned_idx ON public.messages USING btree (conversation_id, pinned_at) WHERE (pinned_at IS NOT NULL);
CREATE INDEX messages_read_status_idx ON public.messages USING btree (conversation_id, sender_id, read_at);
CREATE INDEX messages_unread_idx ON public.messages USING btree (conversation_id, sender_id, read_at, is_deleted);
CREATE INDEX messages_conversation_id_created_at_idx ON public.messages USING btree (conversation_id, created_at);
CREATE INDEX messages_conversation_sender_idx ON public.messages USING btree (conversation_id, sender_id);
CREATE INDEX messages_live_conversation_created_desc_idx ON public.messages USING btree (conversation_id, created_at DESC) WHERE (is_deleted = false);
CREATE INDEX notifications_recipient_id_idx ON public.notifications USING btree (recipient_id);
CREATE INDEX notifications_actor_id_idx ON public.notifications USING btree (actor_id);
CREATE INDEX notifications_is_read_idx ON public.notifications USING btree (is_read);
CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);
CREATE INDEX notifications_content_id_idx ON public.notifications USING btree (content_id);
CREATE INDEX notifications_recipient_read_created_idx ON public.notifications USING btree (recipient_id, is_read, created_at DESC);
CREATE INDEX notifications_recipient_created_idx ON public.notifications USING btree (recipient_id, created_at DESC);
CREATE INDEX paper_access_requests_content_id_idx ON public.paper_access_requests USING btree (content_id);
CREATE INDEX paper_access_requests_requester_id_idx ON public.paper_access_requests USING btree (requester_id);
CREATE INDEX paper_access_requests_owner_id_idx ON public.paper_access_requests USING btree (owner_id);
CREATE INDEX paper_access_requests_owner_status_idx ON public.paper_access_requests USING btree (owner_id, status);
CREATE INDEX paper_access_requests_requester_status_idx ON public.paper_access_requests USING btree (requester_id, status);
CREATE INDEX paper_extracted_images_content_id_idx ON public.paper_extracted_images USING btree (content_id);
CREATE INDEX paper_extracted_images_attachment_id_idx ON public.paper_extracted_images USING btree (attachment_id);
CREATE INDEX post_reports_content_id_idx ON public.post_reports USING btree (content_id);
CREATE INDEX post_reports_reporter_id_idx ON public.post_reports USING btree (reporter_id);
CREATE INDEX post_reports_status_idx ON public.post_reports USING btree (status);
CREATE INDEX profile_requests_receiver_status_idx ON public.profile_requests USING btree (receiver_id, status);
CREATE INDEX profile_requests_requester_status_idx ON public.profile_requests USING btree (requester_id, status);
CREATE INDEX profile_view_events_viewer_id_idx ON public.profile_view_events USING btree (viewer_id);
CREATE INDEX profile_view_events_viewed_profile_id_idx ON public.profile_view_events USING btree (viewed_profile_id);
CREATE INDEX research_requests_receiver_status_idx ON public.research_requests USING btree (receiver_id, status);
CREATE INDEX research_requests_requester_status_idx ON public.research_requests USING btree (requester_id, status);
CREATE INDEX saved_posts_user_content_idx ON public.saved_posts USING btree (user_id, content_id);
CREATE INDEX search_events_user_id_idx ON public.search_events USING btree (user_id);
CREATE INDEX search_events_created_at_idx ON public.search_events USING btree (created_at);
CREATE INDEX user_connections_user_one_idx ON public.user_connections USING btree (user_one_id);
CREATE INDEX user_connections_user_two_idx ON public.user_connections USING btree (user_two_id);
CREATE UNIQUE INDEX user_connections_pair_unique ON public.user_connections USING btree (LEAST(user_one_id, user_two_id), GREATEST(user_one_id, user_two_id));
CREATE INDEX workspace_files_workspace_id_idx ON public.workspace_files USING btree (workspace_id);
CREATE INDEX workspace_meetings_workspace_id_idx ON public.workspace_meetings USING btree (workspace_id);
CREATE INDEX workspace_meetings_created_at_idx ON public.workspace_meetings USING btree (created_at DESC);
CREATE INDEX workspace_members_workspace_id_idx ON public.workspace_members USING btree (workspace_id);
CREATE INDEX workspace_members_user_id_idx ON public.workspace_members USING btree (user_id);
CREATE INDEX workspace_milestones_workspace_id_idx ON public.workspace_milestones USING btree (workspace_id);
CREATE INDEX workspace_recordings_workspace_id_idx ON public.workspace_recordings USING btree (workspace_id);
CREATE INDEX workspace_recordings_meeting_id_idx ON public.workspace_recordings USING btree (meeting_id);
CREATE INDEX workspace_recordings_created_at_idx ON public.workspace_recordings USING btree (created_at DESC);
CREATE INDEX workspace_tasks_workspace_id_idx ON public.workspace_tasks USING btree (workspace_id);
CREATE INDEX workspace_tasks_assigned_to_idx ON public.workspace_tasks USING btree (assigned_to);
CREATE INDEX workspace_tasks_status_idx ON public.workspace_tasks USING btree (status);
CREATE INDEX workspace_updates_workspace_id_idx ON public.workspace_updates USING btree (workspace_id);
CREATE INDEX workspace_updates_created_at_idx ON public.workspace_updates USING btree (created_at DESC);
CREATE INDEX workspaces_owner_id_idx ON public.workspaces USING btree (owner_id);
CREATE INDEX workspaces_workspace_type_idx ON public.workspaces USING btree (workspace_type);
CREATE INDEX workspaces_created_at_idx ON public.workspaces USING btree (created_at DESC);
CREATE OR REPLACE FUNCTION public.is_workspace_member(target_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_workspace_owner(target_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_id = auth.uid()
  );
$function$;
alter table public."content_authors" enable row level security;
alter table public."hidden_posts" enable row level security;
alter table public."notifications" enable row level security;
alter table public."paper_access_requests" enable row level security;
alter table public."post_reports" enable row level security;
alter table public."profile_view_events" enable row level security;
alter table public."search_events" enable row level security;
create policy "content authors are readable" on public."content_authors" as permissive for select to "authenticated" using (true);
create policy "content owners can delete authors" on public."content_authors" as permissive for delete to "authenticated" using ((EXISTS ( SELECT 1
   FROM contents c
  WHERE ((c.id = content_authors.content_id) AND (c.user_id = auth.uid())))));
create policy "content owners can insert authors" on public."content_authors" as permissive for insert to "authenticated" with check ((EXISTS ( SELECT 1
   FROM contents c
  WHERE ((c.id = content_authors.content_id) AND (c.user_id = auth.uid())))));
create policy "content owners can update authors" on public."content_authors" as permissive for update to "authenticated" using ((EXISTS ( SELECT 1
   FROM contents c
  WHERE ((c.id = content_authors.content_id) AND (c.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM contents c
  WHERE ((c.id = content_authors.content_id) AND (c.user_id = auth.uid())))));
create policy "users can hide posts for themselves" on public."hidden_posts" as permissive for insert to "authenticated" with check ((user_id = auth.uid()));
create policy "users can read their own hidden posts" on public."hidden_posts" as permissive for select to "authenticated" using ((user_id = auth.uid()));
create policy "users can unhide their own hidden posts" on public."hidden_posts" as permissive for delete to "authenticated" using ((user_id = auth.uid()));
create policy "authenticated users can create notifications" on public."notifications" as permissive for insert to "authenticated" with check ((actor_id = auth.uid()));
create policy "users can delete own notifications" on public."notifications" as permissive for delete to "authenticated" using ((recipient_id = auth.uid()));
create policy "users can read own notifications" on public."notifications" as permissive for select to "authenticated" using ((recipient_id = auth.uid()));
create policy "users can update own notifications" on public."notifications" as permissive for update to "authenticated" using ((recipient_id = auth.uid())) with check ((recipient_id = auth.uid()));
create policy "paper access requests visible to requester and owner" on public."paper_access_requests" as permissive for select to "authenticated" using (((requester_id = auth.uid()) OR (owner_id = auth.uid())));
create policy "paper owner can update access requests" on public."paper_access_requests" as permissive for update to "authenticated" using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy "users can request paper access" on public."paper_access_requests" as permissive for insert to "authenticated" with check (((requester_id = auth.uid()) AND (owner_id <> auth.uid()) AND (EXISTS ( SELECT 1
   FROM contents c
  WHERE ((c.id = paper_access_requests.content_id) AND (c.user_id = paper_access_requests.owner_id))))));
create policy "users can create their own post reports" on public."post_reports" as permissive for insert to "authenticated" with check ((reporter_id = auth.uid()));
create policy "users can read their own post reports" on public."post_reports" as permissive for select to "authenticated" using ((reporter_id = auth.uid()));
create policy "users can update their own pending reports" on public."post_reports" as permissive for update to "authenticated" using (((reporter_id = auth.uid()) AND (status = 'pending'::text))) with check ((reporter_id = auth.uid()));
create policy "users can create own profile view events" on public."profile_view_events" as permissive for insert to "authenticated" with check ((viewer_id = auth.uid()));
create policy "users can read own profile view events" on public."profile_view_events" as permissive for select to "authenticated" using ((viewer_id = auth.uid()));
create policy "users can create own search events" on public."search_events" as permissive for insert to "authenticated" with check ((user_id = auth.uid()));
create policy "users can read own search events" on public."search_events" as permissive for select to "authenticated" using ((user_id = auth.uid()));
create policy "workspace members can create files" on public."workspace_files" as permissive for insert to "authenticated" with check (((uploaded_by = auth.uid()) AND (is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))));
create policy "workspace members can read files" on public."workspace_files" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can create meetings" on public."workspace_meetings" as permissive for insert to "authenticated" with check (((created_by = auth.uid()) AND (is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))));
create policy "workspace members can read meetings" on public."workspace_meetings" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can read members" on public."workspace_members" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace owners can add members" on public."workspace_members" as permissive for insert to "authenticated" with check (is_workspace_owner(workspace_id));
create policy "workspace owners can remove members" on public."workspace_members" as permissive for delete to "authenticated" using (is_workspace_owner(workspace_id));
create policy "workspace members can create milestones" on public."workspace_milestones" as permissive for insert to "authenticated" with check (((created_by = auth.uid()) AND (is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))));
create policy "workspace members can read milestones" on public."workspace_milestones" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can update milestones" on public."workspace_milestones" as permissive for update to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))) with check ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can create recordings" on public."workspace_recordings" as permissive for insert to "authenticated" with check (((recorded_by = auth.uid()) AND (is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))));
create policy "workspace members can read recordings" on public."workspace_recordings" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can create tasks" on public."workspace_tasks" as permissive for insert to "authenticated" with check (((created_by = auth.uid()) AND (is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))));
create policy "workspace members can read tasks" on public."workspace_tasks" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can update tasks" on public."workspace_tasks" as permissive for update to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))) with check ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "workspace members can create updates" on public."workspace_updates" as permissive for insert to "authenticated" with check (((author_id = auth.uid()) AND (is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id))));
create policy "workspace members can read updates" on public."workspace_updates" as permissive for select to "authenticated" using ((is_workspace_member(workspace_id) OR is_workspace_owner(workspace_id)));
create policy "users can create own workspaces" on public."workspaces" as permissive for insert to "authenticated" with check ((owner_id = auth.uid()));
create policy "workspace owners can update workspaces" on public."workspaces" as permissive for update to "authenticated" using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));
create policy "workspace visible to owner or members" on public."workspaces" as permissive for select to "authenticated" using (((owner_id = auth.uid()) OR is_workspace_member(id)));
create policy "allow authenticated upload to content-files" on storage."objects" as permissive for insert to "authenticated" with check ((bucket_id = 'content-files'::text));
create policy "allow authenticated upload to content-images" on storage."objects" as permissive for insert to "authenticated" with check ((bucket_id = 'content-images'::text));
create policy "allow public read from content-files" on storage."objects" as permissive for select to public using ((bucket_id = 'content-files'::text));
create policy "allow public read from content-images" on storage."objects" as permissive for select to public using ((bucket_id = 'content-images'::text));
create policy "new1 80b85y_0" on storage."objects" as permissive for insert to "authenticated" with check ((bucket_id = 'profile-avatars'::text));
create policy "new2 80b85y_0" on storage."objects" as permissive for select to public using ((bucket_id = 'profile-avatars'::text));
create policy "restricted papers owner can delete" on storage."objects" as permissive for delete to "authenticated" using (((bucket_id = 'restricted-papers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "restricted papers owner can update" on storage."objects" as permissive for update to "authenticated" using (((bucket_id = 'restricted-papers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text))) with check (((bucket_id = 'restricted-papers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "restricted papers owner can upload" on storage."objects" as permissive for insert to "authenticated" with check (((bucket_id = 'restricted-papers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy "restricted papers owner or approved requester can read" on storage."objects" as permissive for select to "authenticated" using (((bucket_id = 'restricted-papers'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM (content_attachments ca
     JOIN paper_access_requests par ON ((par.content_id = ca.content_id)))
  WHERE ((ca.storage_path = objects.name) AND (ca.bucket_name = 'restricted-papers'::text) AND (par.requester_id = auth.uid()) AND (par.status = 'approved'::text)))))));
grant delete, insert, select, update on public."comments" to anon;
grant delete, insert, select, update on public."comments" to authenticated;
grant delete, insert, select, update on public."content_attachments" to anon;
grant delete, insert, select, update on public."content_attachments" to authenticated;
grant delete, insert, select, update on public."content_authors" to anon;
grant delete, insert, select, update on public."content_authors" to authenticated;
grant delete, insert, select, update on public."contents" to anon;
grant delete, insert, select, update on public."contents" to authenticated;
grant delete, insert, select, update on public."conversation_members" to anon;
grant delete, insert, select, update on public."conversation_members" to authenticated;
grant delete, insert, select, update on public."conversations" to anon;
grant delete, insert, select, update on public."conversations" to authenticated;
grant delete, insert, select, update on public."hidden_posts" to anon;
grant delete, insert, select, update on public."hidden_posts" to authenticated;
grant delete, insert, select, update on public."messages" to anon;
grant delete, insert, select, update on public."messages" to authenticated;
grant delete, insert, select, update on public."notifications" to anon;
grant delete, insert, select, update on public."notifications" to authenticated;
grant delete, insert, select, update on public."paper_access_requests" to anon;
grant delete, insert, select, update on public."paper_access_requests" to authenticated;
grant delete, insert, select, update on public."paper_extracted_images" to anon;
grant delete, insert, select, update on public."paper_extracted_images" to authenticated;
grant delete, insert, select, update on public."post_reports" to anon;
grant delete, insert, select, update on public."post_reports" to authenticated;
grant delete, insert, select, update on public."profile_requests" to anon;
grant delete, insert, select, update on public."profile_requests" to authenticated;
grant delete, insert, select, update on public."profile_view_events" to anon;
grant delete, insert, select, update on public."profile_view_events" to authenticated;
grant delete, insert, select, update on public."profiles" to anon;
grant delete, insert, select, update on public."profiles" to authenticated;
grant delete, insert, select, update on public."research_requests" to anon;
grant delete, insert, select, update on public."research_requests" to authenticated;
grant delete, insert, select, update on public."saved_posts" to anon;
grant delete, insert, select, update on public."saved_posts" to authenticated;
grant delete, insert, select, update on public."search_events" to anon;
grant delete, insert, select, update on public."search_events" to authenticated;
grant delete, insert, select, update on public."user_connections" to anon;
grant delete, insert, select, update on public."user_connections" to authenticated;
grant delete, insert, select, update on public."workspace_files" to anon;
grant delete, insert, select, update on public."workspace_files" to authenticated;
grant delete, insert, select, update on public."workspace_meetings" to anon;
grant delete, insert, select, update on public."workspace_meetings" to authenticated;
grant delete, insert, select, update on public."workspace_members" to anon;
grant delete, insert, select, update on public."workspace_members" to authenticated;
grant delete, insert, select, update on public."workspace_milestones" to anon;
grant delete, insert, select, update on public."workspace_milestones" to authenticated;
grant delete, insert, select, update on public."workspace_recordings" to anon;
grant delete, insert, select, update on public."workspace_recordings" to authenticated;
grant delete, insert, select, update on public."workspace_tasks" to anon;
grant delete, insert, select, update on public."workspace_tasks" to authenticated;
grant delete, insert, select, update on public."workspace_updates" to anon;
grant delete, insert, select, update on public."workspace_updates" to authenticated;
grant delete, insert, select, update on public."workspaces" to anon;
grant delete, insert, select, update on public."workspaces" to authenticated;
alter publication supabase_realtime add table public.contents;
alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.paper_access_requests;
alter publication supabase_realtime add table public.profile_requests;
alter publication supabase_realtime add table public.profile_view_events;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.research_requests;
alter publication supabase_realtime add table public.search_events;
alter publication supabase_realtime add table public.user_connections;
insert into storage.buckets (id, name, public) values ('content-files', 'content-files', true);
insert into storage.buckets (id, name, public) values ('content-images', 'content-images', true);
insert into storage.buckets (id, name, public) values ('profile-avatars', 'profile-avatars', true);
insert into storage.buckets (id, name, public) values ('restricted-papers', 'restricted-papers', false);
