-- Applied 15 Oct 2026 with approval. Pullman Melbourne On the Park is now
-- officially "Pullman East Melbourne" (Accor). Name only; nothing else changes.
update public.venues set "venueName" = 'Pullman East Melbourne', updated_at = now()
where id = 'dv-hotel-02' and "venueName" = 'Pullman Melbourne On the Park';
