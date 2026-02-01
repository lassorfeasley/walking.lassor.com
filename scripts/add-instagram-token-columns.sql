-- Migration: Add access_token and expires_at columns to instagram_credentials table
-- This enables storing the actual Instagram access token in the database
-- for automatic refresh without manual environment variable updates.

-- Add new columns for token storage
alter table public.instagram_credentials
  add column if not exists access_token text,
  add column if not exists expires_at timestamptz;

-- Add index for quick lookup of non-expired tokens
create index if not exists instagram_credentials_expires_idx
  on public.instagram_credentials (expires_at desc)
  where access_token is not null;

-- Comment explaining the columns
comment on column public.instagram_credentials.access_token is 'Instagram long-lived access token';
comment on column public.instagram_credentials.expires_at is 'Token expiration timestamp (60 days from refresh)';
