-- Photos of a typed or handwritten list of tanods (one photo per page). The reader turns each line into a
-- row; the secretary reviews them in a table before they are added. Same storage, access rules and
-- deletion at year close as ID scans.
alter type public.scan_kind add value if not exists 'list';
