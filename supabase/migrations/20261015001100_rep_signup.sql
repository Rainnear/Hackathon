-- Sign-up as a Liga Rep, not only as a barangay secretary.
--   Barangay secretary: represents one barangay; asks for a barangay; the municipality's Liga Rep approves.
--   Liga Rep:           represents the whole municipality; asks for a municipality only; the provincial
--                       office approves. Other Liga Reps don't see these requests and can't approve them.

alter table public.profiles add column if not exists requested_role public.user_role;
alter table public.profiles drop constraint if exists requested_role_valid;
alter table public.profiles add constraint requested_role_valid check (requested_role is null or requested_role in ('secretary', 'rep'));

-- A new sign-up: a pending account for the barangay (secretary) or municipality (Liga Rep) they chose.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  wants text := coalesce(nullif(new.raw_user_meta_data ->> 'requested_role', ''), 'secretary');
  requested bigint := nullif(new.raw_user_meta_data ->> 'barangay_id', '')::bigint;
  muni bigint := nullif(new.raw_user_meta_data ->> 'municipality_id', '')::bigint;
  brgy public.barangays;
begin
  if wants = 'rep' then
    insert into public.profiles (id, full_name, phone, role, municipality_id, barangay_id, requested_role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      'pending',
      (select m.id from public.municipalities m where m.id = muni),
      null,
      'rep'
    );
  else
    select * into brgy from public.barangays where id = requested;
    insert into public.profiles (id, full_name, phone, role, municipality_id, barangay_id, requested_role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      'pending',
      brgy.municipality_id,
      brgy.id,
      'secretary'
    );
  end if;
  return new;
end $$;

-- Only the provincial office changes what an account asked to be (people may still edit their name and phone).
create or replace function private.guard_requested_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.requested_role is distinct from old.requested_role
     and private.my_role() is distinct from 'admin' then
    raise exception 'Only the provincial office can change this.' using errcode = '42501';
  end if;
  -- A Liga Rep request is the provincial office's to decide: a municipality's Liga Rep can't touch it.
  if auth.uid() is not null
     and old.requested_role = 'rep' and old.role = 'pending'
     and old.id <> auth.uid()
     and private.my_role() is distinct from 'admin' then
    raise exception 'Only the provincial office can approve a Liga Rep.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_requested on public.profiles;
create trigger profiles_guard_requested before update on public.profiles
  for each row execute function private.guard_requested_role();

-- Liga Reps see their municipality's accounts, except pending requests to become Liga Rep.
drop policy if exists "Read own profile, or profiles you manage" on public.profiles;
create policy "Read own profile, or profiles you manage" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.my_role() = 'admin'
    or (private.can_manage_municipality(municipality_id) and not (role = 'pending' and requested_role is not distinct from 'rep'))
  );
