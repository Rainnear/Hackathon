-- The Liga Rep's review of each barangay's set of documents, with its history.
--
-- The Liga Rep returns a barangay for correction (a reason is required) or accepts it; the barangay
-- secretary answers a return with "fixed, sent back for review". Rows are only ever added, never
-- changed or deleted, so every return and its reason stays on record. The newest row is the current state.
-- The provincial office can read them all but adds none (its view is read-only).

create type public.review_action as enum ('returned', 'accepted', 'resubmitted');

create table public.barangay_reviews (
  id bigint generated always as identity primary key,
  submission_id bigint not null references public.submissions (id) on delete cascade,
  barangay_id bigint not null references public.barangays (id) on delete cascade,
  action public.review_action not null,
  reason text not null default '' check (char_length(reason) <= 4000),
  -- Who did it, stamped by the server: the name is kept here because a secretary can't read the rep's profile.
  created_by uuid not null default auth.uid() references auth.users (id),
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index barangay_reviews_idx on public.barangay_reviews (submission_id, barangay_id, created_at);

create or replace function private.stamp_review()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.barangay_municipality(new.barangay_id) is distinct from private.submission_municipality(new.submission_id) then
    raise exception 'That barangay is not part of this submission''s municipality.' using errcode = '23514';
  end if;
  new.reason := btrim(new.reason);
  if new.action = 'returned' and new.reason = '' then
    raise exception 'Say why the list is returned.' using errcode = '23514';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.author_name := coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid()), '');
  return new;
end $$;
create trigger barangay_reviews_stamp before insert on public.barangay_reviews for each row execute function private.stamp_review();

alter table public.barangay_reviews enable row level security;

create policy "Read reviews of barangays you can access" on public.barangay_reviews for select to authenticated
  using (private.can_access_barangay(barangay_id));

-- Return or accept: the municipality's Liga Rep. Answer a return: that barangay's secretary.
create policy "Liga Rep reviews, secretary answers" on public.barangay_reviews for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (action in ('returned', 'accepted') and private.my_role() = 'rep'
        and private.can_manage_municipality(private.barangay_municipality(barangay_id)))
      or (action = 'resubmitted' and private.my_role() = 'secretary' and private.can_access_barangay(barangay_id))
    )
  );
-- No update or delete policies: the history can't be rewritten.

-- Both sides see a return or an answer as soon as it is made.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.barangay_reviews;
  end if;
end $$;
