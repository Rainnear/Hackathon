-- Lets the app save the order of a barangay's tanod list in one call, so award numbers follow
-- the order the secretary sees. p_tanods lists the tanods in display order; the first gets 1.
-- security invoker: the roster's row-level security still decides who may change what
-- (secretaries only their own barangay while the year is open; reps until it is closed).

create or replace function public.set_roster_order(p_submission bigint, p_barangay bigint, p_tanods uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.roster_entries e
     set sort_order = o.ord
    from unnest(p_tanods) with ordinality as o (tanod_id, ord)
   where e.submission_id = p_submission
     and e.barangay_id = p_barangay
     and e.tanod_id = o.tanod_id
     and e.sort_order is distinct from o.ord::integer;
$$;

revoke execute on function public.set_roster_order(bigint, bigint, uuid[]) from public, anon;
grant execute on function public.set_roster_order(bigint, bigint, uuid[]) to authenticated;
