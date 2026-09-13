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
