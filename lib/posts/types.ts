// Shapes of a post as the Feed and Topic pages show it (shared, audit RG-24).

export type Profile = {
  full_name: string | null;
  email: string | null;
  department?: string | null;
  profile_pic_url?: string | null;
};

export type PlatformAuthor = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  profile_pic_url: string | null;
};

export type ContentAuthor = {
  id: string;
  content_id: string;
  profile_id: string | null;
  manual_name: string | null;
  author_order: number;
  author_role: string;
  profile: PlatformAuthor | null;
};

export type PaperAccessRequestStatus = "pending" | "approved" | "rejected" | null;

export type Attachment = {
  id: string;
  content_id: string;
  file_url: string;
  storage_path: string;
  original_name: string;
  mime_type: string | null;
  file_ext: string | null;
  file_size: number | null;
  attachment_type: string;
  created_at: string;
  bucket_name?: string | null;
  access_level?: string | null;
  file_role?: string | null;
  is_full_paper?: boolean | null;
  is_preview_file?: boolean | null;
};

export type Comment = {
  id: string;
  content_id: string;
  user_id: string;
  comment_text: string;
  created_at: string | null;
  profiles?: Profile | null;
};

export type Post = {
  id: string;
  user_id: string | null;
  title: string | null;
  /** Full text. Null when the reader may only see the abstract (audit RG-07). */
  content: string | null;
  abstract: string | null;
  content_category: string | null;
  visibility_mode: string | null;
  full_paper_access_mode: string | null;
  allow_full_paper_request: boolean;
  doi: string | null;
  keywords: string | null;
  publication_status: string | null;
  publisher_name: string | null;
  publication_date: string | null;
  post_type: string | null;
  created_at: string | null;
  profiles?: Profile | null;
  attachments: Attachment[];
  authors: ContentAuthor[];
  comments: Comment[];
  save_count: number;
  is_saved: boolean;
  request_count: number;
  has_requested: boolean;
  paper_access_request_status: PaperAccessRequestStatus;
  has_full_paper_access: boolean;
};
