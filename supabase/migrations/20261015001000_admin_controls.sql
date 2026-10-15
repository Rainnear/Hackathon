-- The provincial office (administrators) controls tanod limits; secretaries and Tanod Reps no longer can.
-- Run after 20261015000900_tanod_limits.sql, which created the limit log.
--
-- Also: an account can be marked "must change password" (app_metadata.must_change_password). Sakto then
-- asks for a new password at sign-in, and the mark is removed as soon as the password actually changes.

-- ---------------------------------------------------------------- limits: administrators only
drop policy if exists "Reps and admins manage barangays" on public.barangays;
create policy "Admins manage barangays" on public.barangays for all to authenticated
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');

drop function if exists public.set_tanod_limit(bigint, bigint, integer, text);

-- p_year is the year the amendment is for, recorded in the log (optional).
create or replace function public.set_tanod_limit(p_barangay bigint, p_limit integer, p_reason text, p_year integer default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  why text := left(btrim(coalesce(p_reason, '')), 300);
  current_limit integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if private.my_role() is distinct from 'admin' then
    raise exception 'Only the provincial office can change a barangay''s tanod limit.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'The limit must be a number from 1 to 200.' using errcode = '22023';
  end if;
  if length(why) < 3 then
    raise exception 'Write the reason for the change, such as the ordinance or resolution number.' using errcode = '22023';
  end if;

  select tanod_limit into current_limit from public.barangays where id = p_barangay for update;
  if not found then
    raise exception 'That barangay does not exist.' using errcode = '22023';
  end if;
  if current_limit = p_limit then
    raise exception 'The limit is already %.', p_limit using errcode = '22023';
  end if;

  -- Read by the logging trigger from 0900; local to this transaction.
  perform set_config('sakto.limit_reason', why, true);
  perform set_config('sakto.limit_year', coalesce(p_year::text, ''), true);
  update public.barangays set tanod_limit = p_limit where id = p_barangay;
  return p_limit;
end $$;

revoke all on function public.set_tanod_limit(bigint, integer, text, integer) from public, anon;
grant execute on function public.set_tanod_limit(bigint, integer, text, integer) to authenticated;

-- ---------------------------------------------------------------- "must change password"
-- Cleared when the person changes their password (Sakto's change-password screen, or a reset link). An
-- update that sets the mark itself (an administrator resetting the password) keeps it.
create or replace function private.clear_password_flag()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(new.raw_app_meta_data, '{}'::jsonb) ? 'must_change_password'
     and (new.raw_app_meta_data -> 'must_change_password') is not distinct from (old.raw_app_meta_data -> 'must_change_password') then
    new.raw_app_meta_data := new.raw_app_meta_data - 'must_change_password';
  end if;
  return new;
end $$;

drop trigger if exists users_clear_password_flag on auth.users;
create trigger users_clear_password_flag before update of encrypted_password on auth.users
  for each row execute function private.clear_password_flag();
