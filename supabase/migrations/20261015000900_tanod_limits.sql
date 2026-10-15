-- A barangay's tanod limit can be amended (for example by a Sangguniang Barangay resolution).
-- Changes go through set_tanod_limit, which follows the same lock as the list: secretaries while the
-- year is open, the Tanod Rep until it is closed. Every change is logged: who, when, from what to what,
-- and why. The log can be read by the municipality's members and cannot be edited or deleted from the app.

create table public.tanod_limit_changes (
  id bigint generated always as identity primary key,
  barangay_id bigint not null references public.barangays (id) on delete cascade,
  year integer,
  old_limit integer not null,
  new_limit integer not null,
  reason text not null default '',
  changed_by uuid references public.profiles (id) on delete set null,
  changed_by_name text not null default '',
  changed_by_role public.user_role,
  created_at timestamptz not null default now()
);
create index tanod_limit_changes_barangay_idx on public.tanod_limit_changes (barangay_id, created_at desc);

alter table public.tanod_limit_changes enable row level security;
create policy "Members of the municipality read limit changes" on public.tanod_limit_changes for select to authenticated
  using (private.can_read_municipality(private.barangay_municipality(barangay_id)));
-- No insert, update or delete policies: rows are written only by the trigger below.

-- Logs every change of a limit, including any made outside set_tanod_limit (those get no reason).
create or replace function private.log_tanod_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles;
begin
  if new.tanod_limit is not distinct from old.tanod_limit then return new; end if;
  select * into me from public.profiles where id = auth.uid();
  insert into public.tanod_limit_changes (barangay_id, year, old_limit, new_limit, reason, changed_by, changed_by_name, changed_by_role)
  values (
    new.id,
    nullif(current_setting('sakto.limit_year', true), '')::integer,
    old.tanod_limit,
    new.tanod_limit,
    coalesce(current_setting('sakto.limit_reason', true), ''),
    auth.uid(),
    coalesce(me.full_name, ''),
    me.role
  );
  return new;
end $$;

create trigger barangays_log_limit after update of tanod_limit on public.barangays
  for each row execute function private.log_tanod_limit();

create or replace function public.set_tanod_limit(p_submission bigint, p_barangay bigint, p_limit integer, p_reason text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  why text := left(btrim(coalesce(p_reason, '')), 300);
  current_limit integer;
  yr integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not private.can_edit_roster(p_submission, p_barangay) then
    raise exception 'The limit can''t be changed now: the list is locked, or this barangay is not yours.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'The limit must be a number from 1 to 200.' using errcode = '22023';
  end if;
  if length(why) < 3 then
    raise exception 'Write the reason for the change, such as the resolution number.' using errcode = '22023';
  end if;

  select tanod_limit into current_limit from public.barangays where id = p_barangay for update;
  if current_limit = p_limit then
    raise exception 'The limit is already %.', p_limit using errcode = '22023';
  end if;
  select year into yr from public.submissions where id = p_submission;

  -- Read by the logging trigger; local to this transaction.
  perform set_config('sakto.limit_reason', why, true);
  perform set_config('sakto.limit_year', coalesce(yr::text, ''), true);
  update public.barangays set tanod_limit = p_limit where id = p_barangay;
  return p_limit;
end $$;

revoke all on function public.set_tanod_limit(bigint, bigint, integer, text) from public, anon;
grant execute on function public.set_tanod_limit(bigint, bigint, integer, text) to authenticated;
