alter table public.message_contacts
  add column if not exists consent_category text not null default 'all'
    check (consent_category in ('all', 'utility', 'marketing', 'authentication'));

alter table public.message_contacts
  add column if not exists consent_notice_version text;

alter table public.message_contacts
  add column if not exists consent_channel text;

alter table public.message_contacts
  add column if not exists consent_metadata jsonb not null default '{}'::jsonb;

alter table public.message_contacts
  add column if not exists opt_out_at timestamptz;

create index if not exists message_contacts_consent_idx
  on public.message_contacts(consent_status, subscription_status, consent_category);

create index if not exists message_contacts_opt_out_idx
  on public.message_contacts(opt_out_at desc)
  where opt_out_at is not null;
