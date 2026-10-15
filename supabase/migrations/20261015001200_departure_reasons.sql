-- More reasons a tanod leaves the list: AWOL (stopped reporting for duty) and contract or term ended.
alter type public.departure_reason add value if not exists 'awol' after 'resigned';
alter type public.departure_reason add value if not exists 'contract_ended' after 'awol';
