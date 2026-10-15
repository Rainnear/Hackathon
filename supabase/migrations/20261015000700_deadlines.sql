-- Deadlines, shown as a banner at the top of the app.
--   year_deadlines.municipal_due   the provincial office (OPPDC) sets, per year, when every municipality's
--                                  set is due at the province. Only administrators can change it.
--   submissions.barangay_due       the municipal Tanod Rep / Liga sets when their barangays' documents
--                                  are due to them. Secretaries can read it but not change it (they
--                                  cannot update submissions at all).

alter table public.submissions add column barangay_due date;

create table public.year_deadlines (
  year integer primary key check (year between 2000 and 2100),
  municipal_due date not null,
  updated_by uuid not null default auth.uid() references auth.users (id),
  updated_at timestamptz not null default now()
);

create trigger year_deadlines_touch before update on public.year_deadlines
  for each row execute function private.touch_updated_at();

alter table public.year_deadlines enable row level security;
create policy "Everyone signed in can see the provincial deadline" on public.year_deadlines for select to authenticated
  using (true);
create policy "Administrators set the provincial deadline" on public.year_deadlines for insert to authenticated
  with check (private.my_role() = 'admin');
create policy "Administrators change the provincial deadline" on public.year_deadlines for update to authenticated
  using (private.my_role() = 'admin') with check (private.my_role() = 'admin');
create policy "Administrators remove the provincial deadline" on public.year_deadlines for delete to authenticated
  using (private.my_role() = 'admin');
