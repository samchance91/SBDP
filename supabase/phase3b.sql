-- SBDP — let a signed-in user set their display name across their groups.
-- Run in the Supabase SQL Editor (safe to re-run).
create or replace function update_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'name required'; end if;
  update group_members set display_name = trim(p_name) where user_id = auth.uid();
end; $$;
grant execute on function update_my_name(text) to authenticated;
