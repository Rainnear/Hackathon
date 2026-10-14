-- Why a tanod from last year is not in this year's list: recorded when the secretary removes them
-- after copying last year's tanods. Together with roster_entries (who was listed each year) this is
-- the barangay's tanod record: renewed, new, returned, or resigned / removed / deceased / moved.

create type public.departure_reason as enum ('resigned', 'removed', 'deceased', 'moved', 'other');

create table public.tanod_departures (
  -- The year they did not continue in.
  submission_id bigint not null references public.submissions (id) on delete cascade,
  tanod_id uuid not null references public.tanods (id) on delete cascade,
  barangay_id bigint not null references public.barangays (id) on delete restrict,
  reason public.departure_reason not null,
  note text not null default '' check (length(note) <= 500),
  recorded_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (submission_id, tanod_id)
);
create index tanod_departures_barangay_idx on public.tanod_departures (barangay_id);

create trigger tanod_departures_touch before update on public.tanod_departures
  for each row execute function private.touch_updated_at();

-- The barangay must belong to the submission's municipality.
create or replace function private.check_departure()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.barangay_municipality(new.barangay_id) is distinct from private.submission_municipality(new.submission_id) then
    raise exception 'That barangay is not part of this submission''s municipality.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tanod_departures_check before insert or update on public.tanod_departures
  for each row execute function private.check_departure();

alter table public.tanod_departures enable row level security;
create policy "Read departures you can access" on public.tanod_departures for select to authenticated
  using (private.can_access_barangay(barangay_id));
create policy "Record departures while the year is open" on public.tanod_departures for insert to authenticated
  with check (private.can_edit_roster(submission_id, barangay_id));
create policy "Change departures while the year is open" on public.tanod_departures for update to authenticated
  using (private.can_edit_roster(submission_id, barangay_id)) with check (private.can_edit_roster(submission_id, barangay_id));
create policy "Remove departures while the year is open" on public.tanod_departures for delete to authenticated
  using (private.can_edit_roster(submission_id, barangay_id));
