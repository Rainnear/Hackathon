-- ID and document photos: taken with the phone app or uploaded in the web app, read by OCR,
-- then reviewed by the secretary in a pop-up before they become a tanod row.
--
-- Photos live in the private "scans" storage bucket at  <submission id>/<barangay id>/<scan id>/<side>.jpg
-- and follow the same access as the tanod list: a secretary only their own barangay, the Tanod Rep the
-- whole municipality. New photos are accepted only while the year is open (the Rep: until it is closed).
-- The app deletes a year's photos when the Rep closes it (Data Privacy Act: keep them only as long as needed).

create type public.scan_kind as enum ('id', 'certification', 'designation', 'spa');
-- uploading → reading → ready (waiting for review) → saved | discarded; failed when reading went wrong.
create type public.scan_status as enum ('uploading', 'reading', 'ready', 'failed', 'saved', 'discarded');

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  submission_id bigint not null references public.submissions (id) on delete cascade,
  barangay_id bigint not null references public.barangays (id) on delete restrict,
  kind public.scan_kind not null default 'id',
  status public.scan_status not null default 'uploading',
  -- Storage object names in the "scans" bucket.
  front_path text,
  back_path text,
  -- What the reader found: {"last": "...", "first": "...", "mi": "...", "suffix": "...", "birthdate": "...",
  -- "confidence": {"last": 0.98, ...}, "reader": "stand-in" | "<service name>"}
  fields jsonb not null default '{}'::jsonb,
  error text,
  -- The tanod this ID was saved as. Not a foreign key: the tanod may still be waiting to upload from the device.
  tanod_id uuid,
  source text not null default 'web' check (source in ('web', 'phone')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scans_waiting_idx on public.scans (barangay_id, status, created_at);
create index scans_submission_idx on public.scans (submission_id);
create index scans_tanod_idx on public.scans (tanod_id) where tanod_id is not null;

create trigger scans_touch before update on public.scans for each row execute function private.touch_updated_at();

-- A scan's barangay must belong to the submission's municipality, and neither can change afterwards.
create or replace function private.check_scan()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.submission_id := old.submission_id;
    new.barangay_id := old.barangay_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  elsif private.barangay_municipality(new.barangay_id) is distinct from private.submission_municipality(new.submission_id) then
    raise exception 'That barangay is not part of this submission''s municipality.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger scans_check before insert or update on public.scans for each row execute function private.check_scan();

alter table public.scans enable row level security;
create policy "Read scans you can access" on public.scans for select to authenticated
  using (private.can_access_barangay(barangay_id));
create policy "Add scans while the year is open" on public.scans for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_edit_roster(submission_id, barangay_id));
create policy "Review scans while the year is open" on public.scans for update to authenticated
  using (private.can_edit_roster(submission_id, barangay_id)) with check (private.can_edit_roster(submission_id, barangay_id));
-- Deleting is allowed even after the year is locked, so closing the year can remove the photos.
create policy "Delete scans you can access" on public.scans for delete to authenticated
  using (private.can_access_barangay(barangay_id));

-- The phone app's scans appear in the web app's review pop-up as they arrive.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.scans;
  end if;
end $$;

-- ---------------------------------------------------------------- photo storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- "12/345/<uuid>/front.jpg" → part 1 = submission 12, part 2 = barangay 345; anything else → null (refused).
create or replace function private.scan_path_id(name text, part integer)
returns bigint
language sql immutable set search_path = ''
as $$
  select case when split_part(name, '/', part) ~ '^[0-9]{1,18}$' then split_part(name, '/', part)::bigint end
$$;

create policy "Scan photos: view in barangays you can access" on storage.objects for select to authenticated
  using (bucket_id = 'scans' and private.can_access_barangay(private.scan_path_id(name, 2)));
create policy "Scan photos: upload while the year is open" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'scans'
    and private.can_edit_roster(private.scan_path_id(name, 1), private.scan_path_id(name, 2))
  );
create policy "Scan photos: delete in barangays you can access" on storage.objects for delete to authenticated
  using (bucket_id = 'scans' and private.can_access_barangay(private.scan_path_id(name, 2)));
