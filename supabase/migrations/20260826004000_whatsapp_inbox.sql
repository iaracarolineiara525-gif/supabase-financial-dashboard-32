
create table if not exists public.message_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  contact_id uuid references public.message_contacts(id) on delete set null,
  contact_name text,
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  service_window_expires_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text check (last_message_direction in ('inbound', 'outbound')),
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  external_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text' check (message_type in ('text', 'template', 'image', 'video', 'audio', 'document', 'interactive', 'unknown')),
  body text,
  status text not null default 'received' check (status in ('received', 'queued', 'simulated', 'processing', 'sent', 'delivered', 'read', 'failed')),
  sender_phone_e164 text,
  operator_key text,
  outbox_id uuid references public.message_outbox(id) on delete set null,
  provider_timestamp timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists message_conversations_activity_idx
  on public.message_conversations(last_message_at desc nulls last, updated_at desc);

create index if not exists message_conversation_messages_thread_idx
  on public.message_conversation_messages(conversation_id, created_at asc);

create index if not exists message_conversation_messages_external_idx
  on public.message_conversation_messages(external_id)
  where external_id is not null;

alter table public.message_conversations enable row level security;
alter table public.message_conversation_messages enable row level security;

-- Inbox and chat are accessed only through PIN-protected Edge Functions.

create or replace function public.v4_record_inbound_message(
  p_phone_e164 text,
  p_contact_name text,
  p_external_id text,
  p_message_type text,
  p_body text,
  p_provider_timestamp timestamptz,
  p_service_window_expires_at timestamptz,
  p_raw_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id_value uuid;
  message_id_value uuid;
  contact_id_value uuid;
  phone_digits_value text;
begin
  phone_digits_value := regexp_replace(coalesce(p_phone_e164, ''), '[^0-9]', '', 'g');
  if length(phone_digits_value) < 8 or p_external_id is null or p_message_type is null then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_message');
  end if;

  select id into contact_id_value
  from public.message_contacts
  where phone_e164 = phone_digits_value
  order by updated_at desc
  limit 1;

  select id into message_id_value
  from public.message_conversation_messages
  where external_id = p_external_id;

  if message_id_value is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'message_id', message_id_value);
  end if;

  insert into public.message_conversations(
    phone_e164, contact_id, contact_name, status, service_window_expires_at,
    last_message_at, last_message_preview, last_message_direction, unread_count, updated_at
  )
  values (
    phone_digits_value, contact_id_value, nullif(p_contact_name, ''), 'open', p_service_window_expires_at,
    coalesce(p_provider_timestamp, now()), left(coalesce(p_body, '[' || p_message_type || ']'), 240), 'inbound', 1, now()
  )
  on conflict (phone_e164) do update set
    contact_id = coalesce(excluded.contact_id, public.message_conversations.contact_id),
    contact_name = coalesce(excluded.contact_name, public.message_conversations.contact_name),
    status = 'open',
    service_window_expires_at = excluded.service_window_expires_at,
    last_message_at = excluded.last_message_at,
    last_message_preview = excluded.last_message_preview,
    last_message_direction = 'inbound',
    unread_count = public.message_conversations.unread_count + 1,
    updated_at = now()
  returning id into conversation_id_value;

  insert into public.message_conversation_messages(
    conversation_id, external_id, direction, message_type, body, status,
    sender_phone_e164, provider_timestamp, raw_payload
  )
  values (
    conversation_id_value, p_external_id, 'inbound', p_message_type, p_body, 'received',
    phone_digits_value, p_provider_timestamp, coalesce(p_raw_payload, '{}'::jsonb)
  )
  on conflict (external_id) do nothing
  returning id into message_id_value;

  if message_id_value is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'conversation_id', conversation_id_value, 'message_id', message_id_value);
end;
$$;

revoke all on function public.v4_record_inbound_message(text, text, text, text, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.v4_record_inbound_message(text, text, text, text, text, timestamptz, timestamptz, jsonb) to service_role;
