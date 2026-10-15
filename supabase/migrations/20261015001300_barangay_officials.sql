-- The barangay's own details, entered by its secretary on the Setup tab (Barangay details): the
-- Punong Barangay, who signs the Barangay Certification and the barangay's masterlist copy, and the
-- barangay secretary who prepares them. Kept per year with the barangay's requirements.
alter table public.barangay_requirements add column if not exists captain_name text not null default '';
alter table public.barangay_requirements add column if not exists secretary_name text not null default '';
