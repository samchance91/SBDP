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
