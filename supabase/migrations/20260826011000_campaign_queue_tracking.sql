alter table public.message_campaigns
  add column if not exists audience_filter jsonb not null default '{}'::jsonb;

alter table public.message_campaigns
  add column if not exists timezone text not null default 'America/Sao_Paulo';

alter table public.message_campaigns
  add column if not exists max_attempts integer not null default 3 check (max_attempts between 0 and 10);

alter table public.message_campaigns
  add column if not exists quiet_hours_start time;

alter table public.message_campaigns
  add column if not exists quiet_hours_end time;

alter table public.message_campaign_recipients
  add column if not exists max_attempts integer not null default 3 check (max_attempts between 0 and 10);

alter table public.message_campaign_recipients
  add column if not exists next_attempt_at timestamptz;

alter table public.message_campaign_recipients
  add column if not exists last_status_at timestamptz;

alter table public.message_outbox
  add column if not exists accepted_at timestamptz;

alter table public.message_outbox
  add column if not exists delivered_at timestamptz;

alter table public.message_outbox
  add column if not exists read_at timestamptz;

alter table public.message_outbox
  add column if not exists retry_at timestamptz;

alter table public.message_outbox
  add column if not exists provider_error_code text;

create index if not exists message_outbox_delivery_idx
  on public.message_outbox(status, delivered_at desc nulls last, read_at desc nulls last);

create index if not exists message_campaign_recipients_retry_idx
  on public.message_campaign_recipients(status, next_attempt_at)
  where status in ('pending', 'failed');
