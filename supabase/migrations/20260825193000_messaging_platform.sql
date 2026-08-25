create extension if not exists pgcrypto;

create table if not exists public.message_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone_e164 text not null,
  email text,
  group_name text,
  source text not null default 'manual',
  consent_status text not null default 'pending' check (consent_status in ('consented', 'pending', 'revoked')),
  consent_at timestamptz,
  consent_source text,
  subscription_status text not null default 'active' check (subscription_status in ('active', 'unsubscribed', 'blocked', 'invalid')),
  last_sent_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, phone_e164)
);

create table if not exists public.message_suppression (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  reason text not null default 'unsubscribe',
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  body text,
  template_name text,
  template_language text default 'pt_BR',
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  dry_run boolean not null default true,
  rate_limit_per_minute integer not null default 20 check (rate_limit_per_minute > 0 and rate_limit_per_minute <= 1000),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete cascade,
  contact_id uuid not null references public.message_contacts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'delivered', 'read', 'failed', 'blocked', 'cancelled')),
  idempotency_key text not null unique,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create table if not exists public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.message_campaigns(id) on delete set null,
  recipient_id uuid references public.message_campaign_recipients(id) on delete set null,
  to_phone_e164 text not null,
  message_type text not null check (message_type in ('text', 'template', 'media')),
  body_preview text,
  template_name text,
  idempotency_key text not null unique,
  external_id text unique,
  status text not null default 'pending' check (status in ('pending', 'processando', 'simulada', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada', 'bloqueada')),
  dry_run boolean not null default true,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  event_type text not null,
  normalized_status text not null,
  event_hash text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'rejected')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.message_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists message_contacts_owner_idx on public.message_contacts(owner_id, updated_at desc);
create index if not exists message_campaigns_owner_idx on public.message_campaigns(owner_id, updated_at desc);
create index if not exists message_outbox_status_idx on public.message_outbox(status, created_at);
create index if not exists message_outbox_external_idx on public.message_outbox(external_id);
create index if not exists message_events_external_idx on public.message_events(external_id, created_at desc);

alter table public.message_contacts enable row level security;
alter table public.message_suppression enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.message_campaign_recipients enable row level security;
alter table public.message_outbox enable row level security;
alter table public.message_events enable row level security;
alter table public.meta_webhook_events enable row level security;
alter table public.message_audit_logs enable row level security;

create policy "contacts_owner_select" on public.message_contacts for select using (owner_id = auth.uid());
create policy "contacts_owner_insert" on public.message_contacts for insert with check (owner_id = auth.uid());
create policy "contacts_owner_update" on public.message_contacts for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "contacts_owner_delete" on public.message_contacts for delete using (owner_id = auth.uid());

create policy "campaigns_owner_all" on public.message_campaigns for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "campaign_recipients_owner_select" on public.message_campaign_recipients for select using (exists (select 1 from public.message_campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "campaign_recipients_owner_insert" on public.message_campaign_recipients for insert with check (exists (select 1 from public.message_campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "campaign_recipients_owner_update" on public.message_campaign_recipients for update using (exists (select 1 from public.message_campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "outbox_owner_select" on public.message_outbox for select using (actor_id = auth.uid());
create policy "outbox_owner_insert" on public.message_outbox for insert with check (actor_id = auth.uid());
create policy "audit_owner_select" on public.message_audit_logs for select using (actor_id = auth.uid());

-- Supression, eventos e webhooks são gravados e consultados apenas pelas funções server-side com service role.
