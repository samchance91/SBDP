-- SBDP — complete backend setup. Run ONCE in Supabase SQL Editor after schema.sql.
-- Combines sync + phase1 + phase3 + phase3b. Safe to re-run.

-- ===== sync.sql =====
-- SBDP cross-device sync layer.
-- Run this in the Supabase SQL Editor AFTER schema.sql. Safe to re-run.
-- All writes go through SECURITY DEFINER functions that check membership
-- explicitly, so no broad insert/update RLS policies are needed. auth.uid()
-- and auth.jwt() still resolve to the calling user inside these functions.

-- Add an email column used to claim invited placeholders when a person signs in.
alter table group_members add column if not exists email text;

-- Helper: the calling user's display name from their Google identity.
create or replace function sbdp_caller_name() returns text
language sql stable as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() ->> 'email', ''),
    'You');
$$;

-- One JSON snapshot of everything the caller can see. Used to hydrate the app.
create or replace function app_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('groups', coalesce(jsonb_agg(g order by g->>'name'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', gr.id, 'name', gr.name, 'type', gr.type, 'description', gr.description,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'display_name', m.display_name, 'status', m.status,
          'is_me', (m.user_id = auth.uid())) order by m.display_name), '[]'::jsonb)
        from group_members m where m.group_id = gr.id),
      'expenses', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'description', e.description, 'amount_paise', e.amount_paise,
          'spent_on', e.spent_on, 'split_mode', e.split_mode, 'split_config', e.split_config,
          'revision', e.revision,
          'payers', (select coalesce(jsonb_agg(jsonb_build_object('member_id', p.member_id, 'paise', p.paise)), '[]'::jsonb)
            from expense_payers p where p.expense_id = e.id),
          'participants', (select coalesce(jsonb_agg(jsonb_build_object('member_id', ep.member_id, 'share_paise', ep.share_paise)), '[]'::jsonb)
            from expense_participants ep where ep.expense_id = e.id)
        ) order by e.spent_on, e.created_at), '[]'::jsonb)
        from expenses e where e.group_id = gr.id),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', pay.id, 'from_member', pay.from_member, 'to_member', pay.to_member,
          'paise', pay.paise, 'status', pay.status)), '[]'::jsonb)
        from payments pay where pay.group_id = gr.id)
    ) as g
    from groups gr where is_group_member(gr.id) and not gr.archived
  ) sub;
$$;

-- Create a group and add the caller as its first (joined) member.
create or replace function create_group(p_name text, p_type text default null, p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare gid uuid; mid uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  insert into groups(name, type, description, created_by) values (p_name, p_type, p_description, auth.uid()) returning id into gid;
  insert into group_members(group_id, user_id, display_name, status) values (gid, auth.uid(), sbdp_caller_name(), 'joined') returning id into mid;
  return jsonb_build_object('group_id', gid, 'member_id', mid);
end; $$;

-- Invite a named friend (optionally with email) to a group the caller is in.
create or replace function add_group_member(p_group uuid, p_name text, p_email text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if not is_group_member(p_group) then raise exception 'not a member'; end if;
  insert into group_members(group_id, user_id, display_name, status, email)
    values (p_group, null, coalesce(nullif(trim(p_name), ''), p_email, 'Friend'), 'invited', p_email)
    returning id into mid;
  return mid;
end; $$;

-- Mint a shareable invite link token for a group.
create or replace function create_invite_link(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not is_group_member(p_group) then raise exception 'not a member'; end if;
  insert into share_links(group_id, scope, created_by) values (p_group, 'invite', auth.uid()) returning token into tok;
  return tok;
end; $$;

-- Join a group from an invite token. Claims a matching invited placeholder
-- (by email) if one exists, otherwise adds the caller as a new member.
create or replace function join_group(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid; em text; existing uuid; claim uuid;
begin
  select group_id into gid from share_links where token = p_token and not revoked and expires_at > now() and scope = 'invite';
  if gid is null then raise exception 'invalid or expired invite'; end if;
  select id into existing from group_members where group_id = gid and user_id = auth.uid();
  if existing is not null then return gid; end if;
  em := auth.jwt() ->> 'email';
  if em is not null then
    select id into claim from group_members where group_id = gid and user_id is null and lower(email) = lower(em) limit 1;
  end if;
  if claim is not null then
    update group_members set user_id = auth.uid(), status = 'joined' where id = claim;
  else
    insert into group_members(group_id, user_id, display_name, status) values (gid, auth.uid(), sbdp_caller_name(), 'joined');
  end if;
  return gid;
end; $$;

-- Delete a group (creator only) and everything under it.
create or replace function delete_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = p_group and created_by = auth.uid()) then
    raise exception 'only the creator can delete this group';
  end if;
  delete from groups where id = p_group;
end; $$;

-- Delete a single expense (any member of its group).
create or replace function delete_expense(p_expense uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from expenses where id = p_expense;
  if gid is null or not is_group_member(gid) then raise exception 'not allowed'; end if;
  delete from expenses where id = p_expense;
end; $$;

-- Report a payment (from -> to). Both must be members of the group.
create or replace function report_payment(p_group uuid, p_from uuid, p_to uuid, p_paise bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not is_group_member(p_group) then raise exception 'not a member'; end if;
  insert into payments(group_id, from_member, to_member, paise, status, reported_by)
    values (p_group, p_from, p_to, p_paise, 'reported', auth.uid()) returning id into pid;
  return pid;
end; $$;

-- Confirm receipt of a payment. Only the payee (to_member's user) may confirm.
create or replace function confirm_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from payments pay join group_members m on m.id = pay.to_member
    where pay.id = p_payment and m.user_id = auth.uid()
  ) then raise exception 'only the payee can confirm'; end if;
  update payments set status = 'confirmed', confirmed_by = auth.uid() where id = p_payment;
end; $$;

grant execute on function app_snapshot(), create_group(text, text, text), add_group_member(uuid, text, text),
  create_invite_link(uuid), join_group(text), delete_group(uuid), delete_expense(uuid),
  report_payment(uuid, uuid, uuid, bigint), confirm_payment(uuid), save_expense(jsonb) to authenticated;

-- ===== phase1.sql =====
-- SBDP Phase 1 — richer expenses. Run in the Supabase SQL Editor after sync.sql.
-- Adds category / notes / tags / time to expenses and threads them through the
-- write RPC and the snapshot. Safe to re-run.

alter table expenses add column if not exists category text;
alter table expenses add column if not exists notes text;
alter table expenses add column if not exists tags text[] default '{}';
alter table expenses add column if not exists spent_at time;

-- Transactional expense write, now storing the new fields.
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

  select coalesce(sum((p->>'paise')::bigint),0) into pay_sum from jsonb_array_elements(payload->'payers') p;
  select coalesce(sum((s->>'share_paise')::bigint),0) into share_sum from jsonb_array_elements(payload->'participants') s;
  if pay_sum <> amt then raise exception 'payers % <> amount %', pay_sum, amt; end if;
  if share_sum <> amt then raise exception 'shares % <> amount %', share_sum, amt; end if;

  insert into expenses (group_id, description, amount_paise, spent_on, spent_at, split_mode, split_config,
                        category, notes, tags, client_id, created_by)
  values (gid, payload->>'description', amt,
          coalesce((payload->>'spent_on')::date, current_date),
          nullif(payload->>'spent_at','')::time,
          payload->>'split_mode', coalesce(payload->'split_config','{}'),
          nullif(payload->>'category',''), nullif(payload->>'notes',''),
          coalesce((select array_agg(value) from jsonb_array_elements_text(payload->'tags')), '{}'),
          payload->>'client_id', auth.uid())
  on conflict (group_id, client_id) do update
    set description = excluded.description, amount_paise = excluded.amount_paise, spent_on = excluded.spent_on,
        spent_at = excluded.spent_at, split_mode = excluded.split_mode, split_config = excluded.split_config,
        category = excluded.category, notes = excluded.notes, tags = excluded.tags, revision = expenses.revision + 1
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

-- Snapshot, now returning the new fields on each expense.
create or replace function app_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('groups', coalesce(jsonb_agg(g order by g->>'name'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', gr.id, 'name', gr.name, 'type', gr.type, 'description', gr.description,
      'members', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'display_name', m.display_name, 'status', m.status,
          'is_me', (m.user_id = auth.uid())) order by m.display_name), '[]'::jsonb)
        from group_members m where m.group_id = gr.id),
      'expenses', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id, 'description', e.description, 'amount_paise', e.amount_paise,
          'spent_on', e.spent_on, 'spent_at', e.spent_at, 'split_mode', e.split_mode,
          'split_config', e.split_config, 'revision', e.revision,
          'category', e.category, 'notes', e.notes, 'tags', to_jsonb(e.tags),
          'payers', (select coalesce(jsonb_agg(jsonb_build_object('member_id', p.member_id, 'paise', p.paise)), '[]'::jsonb)
            from expense_payers p where p.expense_id = e.id),
          'participants', (select coalesce(jsonb_agg(jsonb_build_object('member_id', ep.member_id, 'share_paise', ep.share_paise)), '[]'::jsonb)
            from expense_participants ep where ep.expense_id = e.id)
        ) order by e.spent_on, e.created_at), '[]'::jsonb)
        from expenses e where e.group_id = gr.id),
      'payments', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', pay.id, 'from_member', pay.from_member, 'to_member', pay.to_member,
          'paise', pay.paise, 'status', pay.status)), '[]'::jsonb)
        from payments pay where pay.group_id = gr.id)
    ) as g
    from groups gr where is_group_member(gr.id) and not gr.archived
  ) sub;
$$;

-- ===== phase3.sql =====
-- SBDP Phase 3 — friends + roles. Run in the Supabase SQL Editor after phase1.sql.
-- Adds member roles, a personal friends list, group-management RPCs, and threads
-- roles + friends through the snapshot. Safe to re-run.

-- Member roles.
alter table group_members add column if not exists role text not null default 'member';
do $$ begin
  alter table group_members add constraint gm_role_chk check (role in ('owner','admin','member','viewer'));
exception when duplicate_object then null; end $$;

-- Backfill: the group creator is the owner.
update group_members m set role = 'owner'
  from groups g where g.id = m.group_id and g.created_by = m.user_id and m.role <> 'owner';

-- Personal friends list (one row per friend email, per user).
create table if not exists friends (
  owner uuid not null references auth.users(id) on delete cascade,
  friend_email text not null,
  display_name text,
  friend_user uuid references auth.users(id),
  favourite boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (owner, friend_email)
);
alter table friends enable row level security;
drop policy if exists "own friends" on friends;
create policy "own friends" on friends for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Caller's role in a group (null if not a member).
create or replace function sbdp_role(p_group uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from group_members where group_id = p_group and user_id = auth.uid();
$$;

-- Creator becomes owner.
create or replace function create_group(p_name text, p_type text default null, p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare gid uuid; mid uuid;
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  insert into groups(name, type, description, created_by) values (p_name, p_type, p_description, auth.uid()) returning id into gid;
  insert into group_members(group_id, user_id, display_name, status, role) values (gid, auth.uid(), sbdp_caller_name(), 'joined', 'owner') returning id into mid;
  return jsonb_build_object('group_id', gid, 'member_id', mid);
end; $$;

-- Edit group details (owner/admin).
create or replace function update_group(p_group uuid, p_name text, p_type text, p_description text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if sbdp_role(p_group) not in ('owner','admin') then raise exception 'not allowed'; end if;
  update groups set name = coalesce(nullif(trim(p_name),''), name), type = p_type, description = p_description where id = p_group;
end; $$;

-- Change a member's role (owner only). Cannot remove the last owner.
create or replace function set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; owners int;
begin
  if p_role not in ('owner','admin','member','viewer') then raise exception 'bad role'; end if;
  select group_id into gid from group_members where id = p_member;
  if sbdp_role(gid) <> 'owner' then raise exception 'only an owner can change roles'; end if;
  if p_role <> 'owner' then
    select count(*) into owners from group_members where group_id = gid and role = 'owner';
    if owners <= 1 and exists (select 1 from group_members where id = p_member and role = 'owner') then
      raise exception 'a group needs at least one owner';
    end if;
  end if;
  update group_members set role = p_role where id = p_member;
end; $$;

-- Remove a member (owner/admin; cannot remove an owner unless you are one).
create or replace function remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare gid uuid; target_role text;
begin
  select group_id, role into gid, target_role from group_members where id = p_member;
  if sbdp_role(gid) not in ('owner','admin') then raise exception 'not allowed'; end if;
  if target_role = 'owner' and sbdp_role(gid) <> 'owner' then raise exception 'cannot remove an owner'; end if;
  delete from group_members where id = p_member;
end; $$;

-- Leave a group. Sole owner must delete the group instead.
create or replace function leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare owners int;
begin
  if sbdp_role(p_group) = 'owner' then
    select count(*) into owners from group_members where group_id = p_group and role = 'owner';
    if owners <= 1 then raise exception 'transfer ownership or delete the group first'; end if;
  end if;
  delete from group_members where group_id = p_group and user_id = auth.uid();
end; $$;

-- Friends.
create or replace function add_friend(p_email text, p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_email),'') = '' then raise exception 'email required'; end if;
  insert into friends(owner, friend_email, display_name, friend_user)
    values (auth.uid(), lower(trim(p_email)), nullif(trim(p_name),''),
            (select id from auth.users where lower(email) = lower(trim(p_email)) limit 1))
  on conflict (owner, friend_email) do update set display_name = coalesce(excluded.display_name, friends.display_name);
end; $$;

create or replace function toggle_favourite_friend(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update friends set favourite = not favourite where owner = auth.uid() and friend_email = lower(trim(p_email));
end; $$;

create or replace function remove_friend(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from friends where owner = auth.uid() and friend_email = lower(trim(p_email));
end; $$;

-- Snapshot now includes each member's role and the caller's friends list.
create or replace function app_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'friends', (select coalesce(jsonb_agg(jsonb_build_object(
        'email', f.friend_email, 'name', f.display_name, 'favourite', f.favourite,
        'registered', (f.friend_user is not null)) order by f.favourite desc, f.display_name), '[]'::jsonb)
      from friends f where f.owner = auth.uid()),
    'groups', coalesce((select jsonb_agg(g order by g->>'name') from (
      select jsonb_build_object(
        'id', gr.id, 'name', gr.name, 'type', gr.type, 'description', gr.description,
        'created_by', gr.created_by,
        'members', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', m.id, 'display_name', m.display_name, 'status', m.status, 'role', m.role,
            'is_me', (m.user_id = auth.uid())) order by m.display_name), '[]'::jsonb)
          from group_members m where m.group_id = gr.id),
        'expenses', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', e.id, 'description', e.description, 'amount_paise', e.amount_paise,
            'spent_on', e.spent_on, 'spent_at', e.spent_at, 'split_mode', e.split_mode,
            'split_config', e.split_config, 'revision', e.revision,
            'category', e.category, 'notes', e.notes, 'tags', to_jsonb(e.tags),
            'payers', (select coalesce(jsonb_agg(jsonb_build_object('member_id', p.member_id, 'paise', p.paise)), '[]'::jsonb)
              from expense_payers p where p.expense_id = e.id),
            'participants', (select coalesce(jsonb_agg(jsonb_build_object('member_id', ep.member_id, 'share_paise', ep.share_paise)), '[]'::jsonb)
              from expense_participants ep where ep.expense_id = e.id)
          ) order by e.spent_on, e.created_at), '[]'::jsonb)
          from expenses e where e.group_id = gr.id),
        'payments', (select coalesce(jsonb_agg(jsonb_build_object(
            'id', pay.id, 'from_member', pay.from_member, 'to_member', pay.to_member,
            'paise', pay.paise, 'status', pay.status)), '[]'::jsonb)
          from payments pay where pay.group_id = gr.id)
      ) as g
      from groups gr where is_group_member(gr.id) and not gr.archived
    ) sub), '[]'::jsonb)
  );
$$;

grant execute on function sbdp_role(uuid), update_group(uuid, text, text, text), set_member_role(uuid, text),
  remove_member(uuid), leave_group(uuid), add_friend(text, text), toggle_favourite_friend(text), remove_friend(text) to authenticated;

-- ===== phase3b.sql =====
-- SBDP — let a signed-in user set their display name across their groups.
-- Run in the Supabase SQL Editor (safe to re-run).
create or replace function update_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'name required'; end if;
  update group_members set display_name = trim(p_name) where user_id = auth.uid();
end; $$;
grant execute on function update_my_name(text) to authenticated;
