-- Migration: social profile + secure share workflow + verification notifications

alter table if exists public.integrity_proofs
  add column if not exists share_token text unique,
  add column if not exists share_enabled boolean not null default false,
  add column if not exists shared_at timestamptz,
  add column if not exists external_check_count integer not null default 0,
  add column if not exists last_external_check_at timestamptz,
  add column if not exists auto_delete_at timestamptz;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  handle text not null unique,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_checks (
  id bigserial primary key,
  verification_id uuid not null references public.integrity_proofs(verification_id) on delete cascade,
  share_token text not null,
  checker_email text not null,
  checker_filename text not null,
  checker_hash_sha3_512 text not null,
  expected_hash_sha3_512 text not null,
  status text not null check (status in ('VERIFIED', 'TAMPERED')),
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id bigserial primary key,
  owner_email text not null,
  verification_id uuid not null references public.integrity_proofs(verification_id) on delete cascade,
  event_type text not null check (event_type in ('SHARED_FILE_RECHECKED', 'SHARED_FILE_TAMPERED', 'AUTO_DELETE_SCHEDULED')),
  checker_email text not null,
  is_tampered boolean not null default false,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.user_profiles enable row level security;
alter table public.verification_checks enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists "Profiles readable by authenticated users" on public.user_profiles;
create policy "Profiles readable by authenticated users"
on public.user_profiles
for select
to authenticated
using (true);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
on public.user_profiles
for insert
to authenticated
with check (id = auth.uid() and email = auth.jwt() ->> 'email');

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and email = auth.jwt() ->> 'email');

drop policy if exists "Users can read checks for own proofs" on public.verification_checks;
create policy "Users can read checks for own proofs"
on public.verification_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.integrity_proofs p
    where p.verification_id = verification_checks.verification_id
      and p.owner_email = auth.jwt() ->> 'email'
  )
);

drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications"
on public.user_notifications
for select
to authenticated
using (owner_email = auth.jwt() ->> 'email');

drop policy if exists "Users can update own notifications" on public.user_notifications;
create policy "Users can update own notifications"
on public.user_notifications
for update
to authenticated
using (owner_email = auth.jwt() ->> 'email')
with check (owner_email = auth.jwt() ->> 'email');

drop function if exists public.touch_updated_at() cascade;
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_touch_updated_at on public.user_profiles;
create trigger trg_user_profiles_touch_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();

create index if not exists idx_integrity_proofs_owner_email on public.integrity_proofs(owner_email);
create index if not exists idx_integrity_proofs_share_token on public.integrity_proofs(share_token);
create index if not exists idx_integrity_proofs_auto_delete_at on public.integrity_proofs(auto_delete_at);
create index if not exists idx_verification_checks_verification_id on public.verification_checks(verification_id);
create index if not exists idx_user_notifications_owner_email_created_at on public.user_notifications(owner_email, created_at desc);
