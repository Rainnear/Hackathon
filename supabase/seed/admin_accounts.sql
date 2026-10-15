-- One-time setup: the two built-in administrator accounts. Run once in the Supabase SQL Editor, after
-- the migrations (it needs 20261015001000_admin_controls.sql). Running it again changes nothing.
--
--   Username      Who
--   OPPDC-ADMIN   the provincial office (OPPDC)
--   DEV-Admin     the Sakto team
--
-- Each signs in with its username and the starting password it was given, and must choose a new
-- password before Sakto opens. Only bcrypt hashes are stored here, never the passwords.
--
-- Supabase signs people in by email, so a username is kept as "<username>@sakto.invalid". The .invalid
-- domain is reserved and can never receive mail, so these accounts cannot reset a forgotten password by
-- email. To reset one, run this in the SQL Editor with a temporary password, and pass that on privately;
-- the person must choose a new password at their next sign-in:
--
--   update auth.users
--      set encrypted_password = extensions.crypt('a-temporary-password', extensions.gen_salt('bf')),
--          raw_app_meta_data = raw_app_meta_data || '{"must_change_password": true}'
--    where email = 'oppdc-admin@sakto.invalid';

do $$
declare
  acct record;
  uid uuid;
begin
  for acct in
    select * from (values
      ('oppdc-admin@sakto.invalid', 'OPPDC Administrator', '$2a$10$jz/Jlv1hJ9V324Zt9X/UKOcTiaZM0N3XyViVHnFxk7N4RafWeDulG'),
      ('dev-admin@sakto.invalid',   'Sakto Developer',     '$2a$10$jzrHe99FfVowmsVLmswHnerLEYxfGdRR.eP7GqI4pNVqd3yBxIxwm')
    ) as v (email, full_name, password_hash)
  loop
    if exists (select 1 from auth.users where email = acct.email) then
      raise notice '% already exists; left as it is.', acct.email;
      continue;
    end if;

    uid := gen_random_uuid();
    -- The token columns must be '' rather than null, or Supabase cannot sign the account in.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', acct.email, acct.password_hash, now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'must_change_password', true),
      jsonb_build_object('full_name', acct.full_name), now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', acct.email, 'email_verified', true), 'email', now(), now(), now());

    -- Sign-up made a "pending" profile; make it an administrator for the whole province.
    update public.profiles
       set role = 'admin', full_name = acct.full_name, municipality_id = null, barangay_id = null, approved_at = now()
     where id = uid;
    raise notice 'Created %.', acct.email;
  end loop;
end $$;
