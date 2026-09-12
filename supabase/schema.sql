-- SBDP database schema (PostgreSQL / Supabase).
-- Money is stored as integer paise (bigint). Never store rupees as float.
-- Row-level security is membership-based: Google sign-in does NOT grant access
-- to every group. Named unregistered participants are separate ledger entities
-- (member rows with null user_id) until claimed.

create extension if not exists "pgcrypto";

-- Profiles mirror auth.users (populated by a trigger on sign-up).
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  description text,
  archived boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- A member is a participant in a group. user_id null => invited/unregistered.
create table if not exists group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid references auth.users(id),
  display_name text not null,
  status text not null default 'invited' check (status in ('joined','invited','not_joined')),
  unique (group_id, user_id)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  description text not null,
  amount_paise bigint not null check (amount_paise > 0),
  spent_on date not null default current_date,
  split_mode text not null check (split_mode in ('equal','exact','percent','shares','equalExtra')),
  split_config jsonb not null default '{}',
  revision int not null default 1,
  client_id text,                         -- idempotency key (unique per group)
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (group_id, client_id)
);

-- Multiple payers per expense; sum of paise must equal expenses.amount_paise
-- (enforced in the write RPC transactionally, below).
create table if not exists expense_payers (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references group_members(id),
  paise bigint not null check (paise >= 0)
);

create table if not exists expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references group_members(id),
  share_paise bigint not null
);

create table if not exists expense_revisions (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  revision int not null,
  snapshot jsonb not null,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_member uuid not null references group_members(id),
  to_member uuid not null references group_members(id),
  paise bigint not null check (paise > 0),
  status text not null default 'reported' check (status in ('reported','confirmed','void')),
  reported_by uuid not null references auth.users(id),
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Private attachments (receipts, voice notes) live in a private Storage bucket
-- 'attachments'; this table records metadata and the object path.
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  kind text not null check (kind in ('receipt','voice')),
  object_path text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Scoped snapshot share links (bearer). Expiring + revocable.
create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  scope text not null check (scope in ('group','personal','invite','expense')),
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked boolean not null default false,
  created_by uuid not null references auth.users(id)
);

-- ---- Helper: is the current user a member of a group? ---------------------
create or replace function is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members m
    where m.group_id = g and m.user_id = auth.uid()
  );
$$;

-- ---- Row-level security ----------------------------------------------------
alter table groups               enable row level security;
alter table group_members        enable row level security;
alter table expenses             enable row level security;
alter table expense_payers       enable row level security;
alter table expense_participants enable row level security;
alter table expense_revisions    enable row level security;
alter table payments             enable row level security;
alter table attachments          enable row level security;
alter table share_links          enable row level security;
alter table profiles             enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid());
create policy "member reads group" on groups for select using (is_group_member(id));
create policy "creator inserts group" on groups for insert with check (created_by = auth.uid());

create policy "member reads members" on group_members for select using (is_group_member(group_id));
create policy "member reads expenses" on expenses for select using (is_group_member(group_id));
create policy "member writes expenses" on expenses for insert with check (is_group_member(group_id) and created_by = auth.uid());
create policy "member updates expenses" on expenses for update using (is_group_member(group_id));

create policy "member reads payers" on expense_payers for select
  using (is_group_member((select group_id from expenses e where e.id = expense_id)));
create policy "member reads participants" on expense_participants for select
  using (is_group_member((select group_id from expenses e where e.id = expense_id)));

create policy "member reads payments" on payments for select using (is_group_member(group_id));
create policy "member reports payment" on payments for insert with check (is_group_member(group_id) and reported_by = auth.uid());
-- Only the payee (to_member's user) may confirm receipt.
create policy "payee confirms" on payments for update using (
  is_group_member(group_id) and
  exists (select 1 from group_members m where m.id = to_member and m.user_id = auth.uid())
);

create policy "member reads attachments" on attachments for select
  using (is_group_member((select group_id from expenses e where e.id = expense_id)));

create policy "member manages links" on share_links for all using (is_group_member(group_id)) with check (is_group_member(group_id));

-- ---- Transactional expense write (idempotent, balanced) -------------------
-- Validates that payers sum to amount and participant shares sum to amount,
-- writes expense + payers + participants + revision atomically.
create or replace function save_expense(payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  amt bigint := (payload->>'amount_paise')::bigint;
  gid uuid := (payload->>'group_id')::uuid;
  pay_sum bigint;
  share_sum bigint;
begin
  if not is_group_member(gid) then raise exception 'not a member'; end if;

  select coalesce(sum((p->>'paise')::bigint),0) into pay_sum
    from jsonb_array_elements(payload->'payers') p;
  select coalesce(sum((s->>'share_paise')::bigint),0) into share_sum
    from jsonb_array_elements(payload->'participants') s;
  if pay_sum <> amt then raise exception 'payers % <> amount %', pay_sum, amt; end if;
  if share_sum <> amt then raise exception 'shares % <> amount %', share_sum, amt; end if;

  insert into expenses (group_id, description, amount_paise, spent_on, split_mode, split_config, client_id, created_by)
  values (gid, payload->>'description', amt, coalesce((payload->>'spent_on')::date, current_date),
          payload->>'split_mode', coalesce(payload->'split_config','{}'), payload->>'client_id', auth.uid())
  on conflict (group_id, client_id) do update set description = excluded.description
  returning id into eid;

  delete from expense_payers where expense_id = eid;
  delete from expense_participants where expense_id = eid;
  insert into expense_payers (expense_id, member_id, paise)
    select eid, (p->>'member_id')::uuid, (p->>'paise')::bigint from jsonb_array_elements(payload->'payers') p;
  insert into expense_participants (expense_id, member_id, share_paise)
    select eid, (s->>'member_id')::uuid, (s->>'share_paise')::bigint from jsonb_array_elements(payload->'participants') s;

  insert into expense_revisions (expense_id, revision, snapshot, edited_by)
    values (eid, (select revision from expenses where id = eid), payload, auth.uid());
  return eid;
end;
$$;
