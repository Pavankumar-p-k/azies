-- Project Aegis schema bootstrap for Supabase

create table if not exists public.integrity_proofs (
  id bigserial primary key,
  verification_id uuid not null unique,
  filename text not null,
  size_bytes bigint not null,
  hash_sha3_512 text not null,
  signature_b64 text not null,
  public_key_b64 text not null,
  pqc_algorithm text not null,
  pqc_backend text not null,
  status text not null check (status in ('VERIFIED', 'TAMPERED')),
  owner_email text not null,
  storage_path text not null,
  vault_nonce_b64 text,
  vault_key_fingerprint text,
  created_at timestamptz not null default now()
);

alter table public.integrity_proofs enable row level security;

create policy "Users can read their own proofs"
on public.integrity_proofs
for select
to authenticated
using (owner_email = auth.jwt() ->> 'email');

create policy "Users can insert their own proofs"
on public.integrity_proofs
for insert
to authenticated
with check (owner_email = auth.jwt() ->> 'email');

create policy "Service role can manage proofs"
on public.integrity_proofs
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('aegis-vault', 'aegis-vault', false)
on conflict (id) do nothing;

create policy "Users can read only their encrypted files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'aegis-vault'
  and (storage.foldername(name))[1] = auth.jwt() ->> 'email'
);

create policy "Users can write only their encrypted files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'aegis-vault'
  and (storage.foldername(name))[1] = auth.jwt() ->> 'email'
);
