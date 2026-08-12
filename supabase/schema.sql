-- PipeForge Supabase schema. Run once in the Supabase SQL editor.
-- Tables: profiles (roles), projects (per-user saves), catalog_items (shared,
-- admin-approved "sealed" system catalog). RLS enforces ownership/admin rules.

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check (security definer → bypasses RLS, no recursion).
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;

create policy "profiles read own or admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Users may edit only their own display_name and can never self-promote:
-- the role must stay 'user' through a client update. Admins change roles via SQL.
create policy "profiles update own name only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');

-- ── projects ────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects read own or admin"
  on public.projects for select
  using (auth.uid() = owner_id or public.is_admin());
create policy "projects insert own"
  on public.projects for insert
  with check (auth.uid() = owner_id);
create policy "projects update own or admin"
  on public.projects for update
  using (auth.uid() = owner_id or public.is_admin());
create policy "projects delete own or admin"
  on public.projects for delete
  using (auth.uid() = owner_id or public.is_admin());

-- ── catalog_items (shared system catalog, admin-approved) ───────────────────
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  def jsonb not null,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.catalog_items enable row level security;

-- Approved items are public (even anonymous/guest designers see them);
-- users additionally see their own submissions; admin sees everything.
create policy "catalog read"
  on public.catalog_items for select
  using (status = 'approved' or auth.uid() = submitted_by or public.is_admin());
create policy "catalog submit own"
  on public.catalog_items for insert
  with check (auth.uid() = submitted_by);
create policy "catalog admin update"
  on public.catalog_items for update
  using (public.is_admin());
create policy "catalog admin delete"
  on public.catalog_items for delete
  using (public.is_admin());

-- ── make yourself admin (run once, with your own email) ─────────────────────
-- update public.profiles set role = 'admin' where email = 'you@example.com';
