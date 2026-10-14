-- Problem reports sent from the Help page. Anyone signed in can send one (including accounts still
-- waiting for approval); they see only their own. Administrators see all of them and mark them solved.

create type public.support_status as enum ('open', 'solved');

create table public.support_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message text not null check (length(btrim(message)) between 1 and 4000),
  -- The page they were on, their device and connection: what a developer needs to reproduce it.
  details jsonb not null default '{}'::jsonb,
  status public.support_status not null default 'open',
  solved_by uuid references auth.users (id),
  solved_at timestamptz,
  created_at timestamptz not null default now()
);
create index support_requests_status_idx on public.support_requests (status, created_at desc);
create index support_requests_user_idx on public.support_requests (user_id, created_at desc);

-- Records who solved a report and when, so the client cannot fake either.
create or replace function private.stamp_support_status()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.solved_by := case when new.status = 'solved' then auth.uid() end;
    new.solved_at := case when new.status = 'solved' then now() end;
  end if;
  -- Only the status may change; the report itself stays as it was sent.
  new.user_id := old.user_id;
  new.message := old.message;
  new.details := old.details;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger support_requests_stamp before update on public.support_requests
  for each row execute function private.stamp_support_status();

alter table public.support_requests enable row level security;

create policy "Send your own problem reports" on public.support_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and solved_by is null and solved_at is null);
create policy "Read your own reports; admins read all" on public.support_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.my_role() = 'admin');
create policy "Admins mark reports solved" on public.support_requests for update to authenticated
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
