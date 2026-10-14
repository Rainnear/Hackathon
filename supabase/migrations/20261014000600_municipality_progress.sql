-- How every barangay in a municipality is doing this year, as counts only (no tanod names), so a
-- barangay secretary can see where the others stand without seeing their personal data.
-- Anyone approved in the municipality may call it; security definer lets it count rows the caller
-- can't read directly, and it returns nothing for a submission outside the caller's municipality.

create or replace function public.municipality_progress(p_submission bigint)
returns table (
  barangay_id bigint,
  barangay text,
  sort_order integer,
  tanod_limit integer,
  listed integer,
  ids_complete integer,
  certification boolean,
  designation boolean,
  last_update timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.name,
    b.sort_order,
    b.tanod_limit,
    count(e.tanod_id)::integer,
    (count(e.tanod_id) filter (where e.id_signatures >= 3))::integer,
    coalesce(r.certification, false),
    coalesce(r.designation, false),
    greatest(max(e.updated_at), r.updated_at)
  from public.submissions s
  join public.barangays b on b.municipality_id = s.municipality_id
  left join public.roster_entries e on e.submission_id = s.id and e.barangay_id = b.id
  left join public.barangay_requirements r on r.submission_id = s.id and r.barangay_id = b.id
  where s.id = p_submission
    and private.can_read_municipality(s.municipality_id)
  group by b.id, b.name, b.sort_order, b.tanod_limit, r.certification, r.designation, r.updated_at
  order by b.sort_order, b.id
$$;

revoke execute on function public.municipality_progress(bigint) from public, anon;
grant execute on function public.municipality_progress(bigint) to authenticated;
