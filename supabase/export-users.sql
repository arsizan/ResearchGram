-- ResearchGram: export login accounts for the move to Mumbai. READ-ONLY.
-- Contains password hashes. Keep the file on your computer, never share it,
-- and delete it after the move.
select jsonb_agg(jsonb_build_object(
  'id', u.id,
  'email', u.email,
  'password_hash', u.encrypted_password,
  'email_confirmed', u.email_confirmed_at is not null,
  'user_metadata', coalesce(u.raw_user_meta_data, '{}'::jsonb)
) order by u.created_at) as users
from auth.users u;
