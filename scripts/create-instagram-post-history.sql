-- Instagram post history table
create table if not exists public.instagram_post_history (
  id uuid primary key default gen_random_uuid(),
  panorama_id uuid not null references public.panorama_images(id) on delete cascade,
  caption text,
  status text not null default 'posted',
  instagram_post_id text,
  posted_by uuid references auth.users(id),
  posted_at timestamptz default timezone('utc', now()),
  result_payload jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists instagram_post_history_panorama_idx
  on public.instagram_post_history(panorama_id);

alter table public.instagram_post_history enable row level security;

create policy "Allow authenticated admins to log posts"
  on public.instagram_post_history
  for insert
  with check (
    auth.role() = 'authenticated'
    and (posted_by = auth.uid() or posted_by is null)
  );

