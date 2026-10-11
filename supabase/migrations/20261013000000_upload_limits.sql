-- Upload limits per bucket (audit RG-21). Keep in step with lib/uploadRules.ts.
-- Storage refuses anything else, so an HTML or SVG file can never be stored and
-- then opened from our storage as a web page. Existing files are not touched.

update storage.buckets
set file_size_limit = 52428800,  -- 50 MB, the Free plan's per-file maximum
    allowed_mime_types = array[
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
    'application/octet-stream'
  ]
where id in ('content-files', 'restricted-papers', 'workspace-files');

update storage.buckets
set file_size_limit = 5242880,  -- 5 MB
    allowed_mime_types = array[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
  ]
where id in ('profile-avatars', 'content-images');
