create table if not exists public.instagram_credentials (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  expires_at timestamptz,
  last_refreshed_at timestamptz not null default timezone('utc', now()),
  refresher_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);

create index if not exists instagram_credentials_refreshed_idx
  on public.instagram_credentials (last_refreshed_at desc);

create index if not exists instagram_credentials_expires_idx
  on public.instagram_credentials (expires_at desc)
  where access_token is not null;

alter table public.instagram_credentials enable row level security;

create policy "Admin read instagram credentials"
  on public.instagram_credentials
  for select
  using (auth.role() = 'authenticated');

create policy "Admin insert instagram credentials"
  on public.instagram_credentials
  for insert
  with check (auth.role() = 'authenticated');

create policy "Admin update instagram credentials"
  on public.instagram_credentials
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

