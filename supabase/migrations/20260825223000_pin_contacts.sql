-- O acesso V4 usa uma sessão PIN server-side, sem auth.uid().
-- Contatos importados por esse operador ficam com owner_id NULL e só são
-- escritos/lidos pelas Edge Functions com service role.
alter table public.message_contacts
  alter column owner_id drop not null;

create unique index if not exists message_contacts_pin_phone_unique
  on public.message_contacts (phone_e164)
  where owner_id is null;

create index if not exists message_contacts_pin_updated_idx
  on public.message_contacts (updated_at desc)
  where owner_id is null;
