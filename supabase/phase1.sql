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
