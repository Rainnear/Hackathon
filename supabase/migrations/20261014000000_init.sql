-- Sakto: accounts, reference lists and tanod history.
--
-- Passwords are NOT stored in these tables. Supabase Auth keeps them (hashed) in auth.users;
-- public.profiles holds everything else about each person who signs in.
--
-- Who can do what (enforced by row-level security below):
--   pending    signed up, waiting for the municipal Tanod Rep to approve; sees only their own profile
--   secretary  reads and edits the tanods of their own barangay
--   rep        municipal Tanod Rep; everything in their municipality, approves secretaries
--   admin      provincial administrator; everything everywhere, assigns reps

-- ---------------------------------------------------------------- types
create type public.user_role as enum ('pending', 'secretary', 'rep', 'admin');
create type public.tanod_position as enum ('BARANGAY TANOD', 'CHIEF TANOD');
create type public.submission_status as enum ('open', 'submitted', 'closed');

-- Helpers live outside the API-exposed schema so they cannot be called over the REST API.
create schema if not exists private;

-- ---------------------------------------------------------------- reference data
create table public.municipalities (
  id bigint generated always as identity primary key,
  province text not null default 'Iloilo',
  name text not null,
  created_at timestamptz not null default now(),
  unique (province, name)
);

create table public.barangays (
  id bigint generated always as identity primary key,
  municipality_id bigint not null references public.municipalities (id) on delete restrict,
  name text not null,
  tanod_limit integer not null check (tanod_limit > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (municipality_id, name)
);
create index barangays_municipality_idx on public.barangays (municipality_id, sort_order);

-- ---------------------------------------------------------------- people who sign in
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  role public.user_role not null default 'pending',
  municipality_id bigint references public.municipalities (id),
  -- For a pending account this is the barangay they asked for; for a secretary it is the one they manage.
  barangay_id bigint references public.barangays (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_has_barangay check (role <> 'secretary' or barangay_id is not null),
  constraint rep_has_municipality check (role not in ('secretary', 'rep') or municipality_id is not null)
);
create index profiles_municipality_idx on public.profiles (municipality_id);

-- ---------------------------------------------------------------- tanods and yearly rosters
-- One row per person, kept for good. Their yearly listings are in roster_entries,
-- so "all past tanods of a barangay" is a simple query and nothing is lost between years.
create table public.tanods (
  id uuid primary key default gen_random_uuid(),
  barangay_id bigint not null references public.barangays (id) on delete restrict,
  last_name text not null check (last_name <> ''),
  first_name text not null check (first_name <> ''),
  middle_initial text not null default '',
  suffix text not null default '' check (suffix in ('', 'JR.', 'SR.', 'II', 'III', 'IV')),
  birthdate date,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tanods_barangay_name_idx on public.tanods (barangay_id, last_name, first_name);

-- One submission per municipality per calendar year: the amount, signatories and ObR printed on that year's set.
create table public.submissions (
  id bigint generated always as identity primary key,
  municipality_id bigint not null references public.municipalities (id) on delete restrict,
  year integer not null check (year between 2000 and 2100),
  amount_per_tanod numeric(10, 2) not null default 1000 check (amount_per_tanod >= 1000),
  signatories jsonb not null default '{}'::jsonb,
  obr_no text not null default '',
  obr_payee text not null default '',
  obr_amount text not null default '',
  status public.submission_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, year)
);

-- A tanod listed in a given year's submission. Award numbers are computed from barangay order and sort_order.
create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id bigint not null references public.submissions (id) on delete cascade,
  barangay_id bigint not null references public.barangays (id) on delete restrict,
  tanod_id uuid not null references public.tanods (id) on delete restrict,
  position public.tanod_position not null default 'BARANGAY TANOD',
  id_signatures smallint not null default 0 check (id_signatures between 0 and 3),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, tanod_id)
);
create index roster_entries_submission_barangay_idx on public.roster_entries (submission_id, barangay_id, sort_order);
create index roster_entries_tanod_idx on public.roster_entries (tanod_id);

-- Per barangay, per year: documents received and the focal person who gets SMS reminders.
create table public.barangay_requirements (
  submission_id bigint not null references public.submissions (id) on delete cascade,
  barangay_id bigint not null references public.barangays (id) on delete restrict,
  certification boolean not null default false,
  designation boolean not null default false,
  via_representative boolean not null default false,
  spa boolean not null default false,
  focal_name text not null default '',
  focal_phone text not null default '',
  updated_at timestamptz not null default now(),
  primary key (submission_id, barangay_id)
);

-- ---------------------------------------------------------------- helper functions
-- security definer so they can read profiles without tripping the profiles policies (no recursion).
create or replace function private.my_profile()
returns public.profiles
language sql stable security definer set search_path = ''
as $$ select p.* from public.profiles p where p.id = auth.uid() $$;

create or replace function private.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select (private.my_profile()).role $$;

create or replace function private.barangay_municipality(b bigint)
returns bigint
language sql stable security definer set search_path = ''
as $$ select municipality_id from public.barangays where id = b $$;

create or replace function private.submission_municipality(s bigint)
returns bigint
language sql stable security definer set search_path = ''
as $$ select municipality_id from public.submissions where id = s $$;

-- Admins anywhere; reps in their own municipality.
create or replace function private.can_manage_municipality(m bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' or (p.role = 'rep' and p.municipality_id = m) from public.profiles p where p.id = auth.uid()),
    false)
$$;

-- Any approved member of the municipality may read its submission.
create or replace function private.can_read_municipality(m bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' or (p.role in ('rep', 'secretary') and p.municipality_id = m) from public.profiles p where p.id = auth.uid()),
    false)
$$;

-- Secretaries: their own barangay. Reps and admins: per can_manage_municipality.
create or replace function private.can_access_barangay(b bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select (p.role = 'secretary' and p.barangay_id = b)
         or private.can_manage_municipality(private.barangay_municipality(b))
       from public.profiles p where p.id = auth.uid()),
    false)
$$;

-- Secretaries may change a year's roster only while it is open; reps until it is closed.
create or replace function private.can_edit_roster(s bigint, b bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_access_barangay(b)
     and private.barangay_municipality(b) = private.submission_municipality(s)
     and coalesce((
       select case when private.can_manage_municipality(sub.municipality_id) then sub.status <> 'closed'
                   else sub.status = 'open' end
         from public.submissions sub where sub.id = s), false)
$$;

-- ---------------------------------------------------------------- triggers
create or replace function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger tanods_touch before update on public.tanods for each row execute function private.touch_updated_at();
create trigger submissions_touch before update on public.submissions for each row execute function private.touch_updated_at();
create trigger roster_entries_touch before update on public.roster_entries for each row execute function private.touch_updated_at();
create trigger barangay_requirements_touch before update on public.barangay_requirements for each row execute function private.touch_updated_at();

-- Every new sign-up gets a pending profile for the barangay they chose. Nobody can sign themselves up as a rep.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  requested bigint := nullif(new.raw_user_meta_data ->> 'barangay_id', '')::bigint;
  brgy public.barangays;
begin
  select * into brgy from public.barangays where id = requested;
  insert into public.profiles (id, full_name, phone, role, municipality_id, barangay_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    'pending',
    brgy.municipality_id,
    brgy.id
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- People may edit their own name and phone. Only a rep (own municipality, pending/secretary roles only)
-- or an admin may change role, municipality or barangay. SQL run from the dashboard (no auth.uid()) is trusted.
create or replace function private.guard_profile_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles;
begin
  if auth.uid() is null then return new; end if;
  if new.role is not distinct from old.role
     and new.municipality_id is not distinct from old.municipality_id
     and new.barangay_id is not distinct from old.barangay_id then
    return new;
  end if;

  select * into me from public.profiles where id = auth.uid();
  if me.role = 'admin' then
    null;
  elsif me.role = 'rep'
        and old.municipality_id = me.municipality_id
        and new.municipality_id = me.municipality_id
        and old.role in ('pending', 'secretary')
        and new.role in ('pending', 'secretary')
        and old.id <> me.id
        and (new.barangay_id is null or private.barangay_municipality(new.barangay_id) = me.municipality_id) then
    null;
  else
    raise exception 'Only the municipal Tanod Rep or an admin can change roles and assignments.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role and new.role in ('secretary', 'rep', 'admin') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles for each row execute function private.guard_profile_changes();

-- A roster entry's barangay must belong to the submission's municipality.
create or replace function private.check_roster_entry()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.barangay_municipality(new.barangay_id) is distinct from private.submission_municipality(new.submission_id) then
    raise exception 'That barangay is not part of this submission''s municipality.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger roster_entries_check before insert or update on public.roster_entries for each row execute function private.check_roster_entry();

-- ---------------------------------------------------------------- row-level security
alter table public.municipalities enable row level security;
alter table public.barangays enable row level security;
alter table public.profiles enable row level security;
alter table public.tanods enable row level security;
alter table public.submissions enable row level security;
alter table public.roster_entries enable row level security;
alter table public.barangay_requirements enable row level security;

-- Reference lists are public: the sign-up form needs them before anyone is signed in.
create policy "Anyone can read municipalities" on public.municipalities for select to anon, authenticated using (true);
create policy "Anyone can read barangays" on public.barangays for select to anon, authenticated using (true);
create policy "Admins manage municipalities" on public.municipalities for all to authenticated
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
create policy "Reps and admins manage barangays" on public.barangays for all to authenticated
  using (private.can_manage_municipality(municipality_id)) with check (private.can_manage_municipality(municipality_id));

create policy "Read own profile, or profiles you manage" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.can_manage_municipality(municipality_id));
create policy "Update own profile, or profiles you manage" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.can_manage_municipality(municipality_id))
  with check (id = (select auth.uid()) or private.can_manage_municipality(municipality_id));

create policy "Read tanods you can access" on public.tanods for select to authenticated using (private.can_access_barangay(barangay_id));
create policy "Add tanods you can access" on public.tanods for insert to authenticated with check (private.can_access_barangay(barangay_id));
create policy "Edit tanods you can access" on public.tanods for update to authenticated
  using (private.can_access_barangay(barangay_id)) with check (private.can_access_barangay(barangay_id));
create policy "Delete tanods you manage" on public.tanods for delete to authenticated
  using (private.can_manage_municipality(private.barangay_municipality(barangay_id)));

create policy "Members read their submissions" on public.submissions for select to authenticated using (private.can_read_municipality(municipality_id));
create policy "Reps create submissions" on public.submissions for insert to authenticated with check (private.can_manage_municipality(municipality_id));
create policy "Reps edit submissions" on public.submissions for update to authenticated
  using (private.can_manage_municipality(municipality_id)) with check (private.can_manage_municipality(municipality_id));

create policy "Read roster entries you can access" on public.roster_entries for select to authenticated using (private.can_access_barangay(barangay_id));
create policy "Add roster entries" on public.roster_entries for insert to authenticated with check (private.can_edit_roster(submission_id, barangay_id));
create policy "Edit roster entries" on public.roster_entries for update to authenticated
  using (private.can_edit_roster(submission_id, barangay_id)) with check (private.can_edit_roster(submission_id, barangay_id));
create policy "Remove roster entries" on public.roster_entries for delete to authenticated using (private.can_edit_roster(submission_id, barangay_id));

create policy "Read requirements you can access" on public.barangay_requirements for select to authenticated using (private.can_access_barangay(barangay_id));
create policy "Add requirements" on public.barangay_requirements for insert to authenticated with check (private.can_edit_roster(submission_id, barangay_id));
create policy "Edit requirements" on public.barangay_requirements for update to authenticated
  using (private.can_edit_roster(submission_id, barangay_id)) with check (private.can_edit_roster(submission_id, barangay_id));

-- ---------------------------------------------------------------- history view
-- Every year each tanod was listed. security_invoker makes it follow the table policies above.
create view public.tanod_history with (security_invoker = true) as
select
  t.id as tanod_id,
  t.last_name, t.first_name, t.middle_initial, t.suffix, t.birthdate,
  b.id as barangay_id, b.name as barangay,
  m.id as municipality_id, m.name as municipality,
  s.year, e.position, e.id_signatures
from public.roster_entries e
join public.tanods t on t.id = e.tanod_id
join public.submissions s on s.id = e.submission_id
join public.barangays b on b.id = e.barangay_id
join public.municipalities m on m.id = b.municipality_id;

-- ---------------------------------------------------------------- seed: Ajuy (from "Number of Tanods per Barangay – Ajuy")
with m as (
  insert into public.municipalities (province, name) values ('Iloilo', 'Ajuy') returning id
)
insert into public.barangays (municipality_id, name, tanod_limit, sort_order)
select m.id, v.name, v.tanod_limit, v.sort_order
from m, (values
  ('Adcadarao', 13, 1), ('Agbobolo', 9, 2), ('Badiangan', 10, 3), ('Barrido', 13, 4), ('Bato Biasong', 11, 5),
  ('Bay-ang', 18, 6), ('Bucana Bunglas', 11, 7), ('Central', 9, 8), ('Culasi', 15, 9), ('Lanjagan', 11, 10),
  ('Luca', 15, 11), ('Malayuan', 15, 12), ('Mangorocoro', 12, 13), ('Nasidman', 6, 14), ('Pantalan Nabaye', 16, 15),
  ('Pantalan Navarro', 8, 16), ('Pedada', 10, 17), ('Pili', 16, 18), ('Pinantan Diel', 12, 19), ('Pinantan Elizalde', 7, 20),
  ('Pinay Espinosa', 11, 21), ('Poblacion', 19, 22), ('Progreso', 14, 23), ('Puente Bunglas', 11, 24), ('Punta Buri', 10, 25),
  ('Rojas', 6, 26), ('San Antonio', 15, 27), ('Silagon', 7, 28), ('Sto. Rosario', 12, 29), ('Tagubanhan', 12, 30),
  ('Taguhangin', 10, 31), ('Tanduyan', 14, 32), ('Tipacla', 13, 33), ('Tubogan', 9, 34)
) as v (name, tanod_limit, sort_order);
