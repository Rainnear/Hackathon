-- Demo mode: a new barangay secretary or Liga Rep gets the role they asked for at once, with no approval.
-- The approval flow itself is unchanged; it is skipped only while the switch is on. After the demo:
--   update private.app_settings set value = 'off' where key = 'auto_approve';

create table if not exists private.app_settings (
  key text primary key,
  value text not null
);
insert into private.app_settings (key, value) values ('auto_approve', 'on')
  on conflict (key) do update set value = excluded.value;

create or replace function private.auto_approve()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select value = 'on' from private.app_settings where key = 'auto_approve'), false) $$;

-- Same as 20261015001100_rep_signup.sql, except the role while the demo switch is on.
-- An account still waits if the barangay or municipality it asked for doesn't exist.
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  wants text := coalesce(nullif(new.raw_user_meta_data ->> 'requested_role', ''), 'secretary');
  requested bigint := nullif(new.raw_user_meta_data ->> 'barangay_id', '')::bigint;
  muni bigint := nullif(new.raw_user_meta_data ->> 'municipality_id', '')::bigint;
  brgy public.barangays;
  muni_id bigint;
  auto boolean := private.auto_approve();
begin
  if wants = 'rep' then
    select m.id into muni_id from public.municipalities m where m.id = muni;
    insert into public.profiles (id, full_name, phone, role, municipality_id, barangay_id, requested_role, approved_at)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      case when auto and muni_id is not null then 'rep' else 'pending' end::public.user_role,
      muni_id,
      null,
      'rep',
      case when auto and muni_id is not null then now() end
    );
  else
    select * into brgy from public.barangays where id = requested;
    insert into public.profiles (id, full_name, phone, role, municipality_id, barangay_id, requested_role, approved_at)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      case when auto and brgy.id is not null then 'secretary' else 'pending' end::public.user_role,
      brgy.municipality_id,
      brgy.id,
      'secretary',
      case when auto and brgy.id is not null then now() end
    );
  end if;
  return new;
end $$;

-- Let anyone already waiting in through the same door.
update public.profiles set role = 'rep', approved_at = now()
  where private.auto_approve() and role = 'pending' and requested_role = 'rep' and municipality_id is not null;
update public.profiles set role = 'secretary', approved_at = now()
  where private.auto_approve() and role = 'pending' and coalesce(requested_role, 'secretary') = 'secretary' and barangay_id is not null;
