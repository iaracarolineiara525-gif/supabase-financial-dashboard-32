
create table if not exists public.v4_operator_roles (
  operator_key text primary key,
  display_name text not null,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.v4_operator_roles(operator_key, display_name, role)
values ('primary', 'Operador principal V4', 'owner')
on conflict (operator_key) do nothing;

alter table public.v4_pin_sessions
  add column if not exists operator_key text not null default 'primary';

alter table public.message_audit_logs
  add column if not exists operator_key text;

alter table public.message_outbox
  add column if not exists operator_key text;

create index if not exists v4_pin_sessions_operator_idx
  on public.v4_pin_sessions(operator_key, expires_at)
  where revoked_at is null;

create index if not exists message_audit_operator_idx
  on public.message_audit_logs(operator_key, created_at desc);

create index if not exists message_outbox_operator_idx
  on public.message_outbox(operator_key, created_at desc);

alter table public.v4_operator_roles enable row level security;

create or replace function public.v4_pin_validate_session(p_session_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.v4_pin_sessions;
  role_row public.v4_operator_roles;
begin
  select * into session_row
  from public.v4_pin_sessions
  where token_hash = p_session_hash
    and revoked_at is null
    and expires_at > p_now
  for update;

  if session_row.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_session');
  end if;

  select * into role_row
  from public.v4_operator_roles
  where operator_key = session_row.operator_key
    and active = true;

  if role_row.operator_key is null then
    return jsonb_build_object('ok', false, 'error_code', 'operator_inactive');
  end if;

  update public.v4_pin_sessions
  set last_seen_at = p_now
  where id = session_row.id;

  return jsonb_build_object(
    'ok', true,
    'expires_at', session_row.expires_at,
    'operator_key', role_row.operator_key,
    'operator_name', role_row.display_name,
    'role', role_row.role
  );
end;
$$;

revoke all on function public.v4_pin_validate_session(text, timestamptz) from public, anon, authenticated;
grant execute on function public.v4_pin_validate_session(text, timestamptz) to service_role;
