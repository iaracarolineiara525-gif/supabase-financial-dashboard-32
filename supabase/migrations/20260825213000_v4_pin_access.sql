create extension if not exists pgcrypto;

create table if not exists public.v4_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v4_pin_attempts_fingerprint_idx on public.v4_pin_attempts(fingerprint);

create table if not exists public.v4_pin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now()
);

create index if not exists v4_pin_sessions_active_idx on public.v4_pin_sessions(token_hash, expires_at) where revoked_at is null;

create or replace function public.v4_pin_login_attempt(
  p_fingerprint text,
  p_pin_hash text,
  p_configured_pin_hash text,
  p_session_hash text,
  p_session_expires_at timestamptz,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_row public.v4_pin_attempts;
  next_failures integer;
  lock_seconds integer;
  success boolean;
begin
  if p_fingerprint is null or length(p_fingerprint) < 16 then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_request');
  end if;

  select * into attempt_row
  from public.v4_pin_attempts
  where fingerprint = p_fingerprint
  for update;

  if attempt_row.id is null then
    insert into public.v4_pin_attempts(fingerprint)
    values (p_fingerprint)
    returning * into attempt_row;
  end if;

  if attempt_row.locked_until is not null and attempt_row.locked_until > p_now then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'locked',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (attempt_row.locked_until - p_now)))::integer)
    );
  end if;

  success := p_pin_hash = p_configured_pin_hash;

  if success then
    update public.v4_pin_attempts
    set failed_attempts = 0, locked_until = null, last_attempt_at = p_now, updated_at = p_now
    where id = attempt_row.id;

    insert into public.v4_pin_sessions(token_hash, expires_at, last_seen_at)
    values (p_session_hash, p_session_expires_at, p_now);

    return jsonb_build_object('ok', true, 'expires_at', p_session_expires_at);
  end if;

  next_failures := attempt_row.failed_attempts + 1;
  lock_seconds := case
    when next_failures >= 8 then 900
    when next_failures >= 5 then 300
    when next_failures >= 3 then 60
    else 0
  end;

  update public.v4_pin_attempts
  set failed_attempts = next_failures,
      locked_until = case when lock_seconds > 0 then p_now + make_interval(secs => lock_seconds) else null end,
      last_attempt_at = p_now,
      updated_at = p_now
  where id = attempt_row.id;

  return jsonb_build_object(
    'ok', false,
    'error_code', 'invalid_pin',
    'failed_attempts', next_failures,
    'retry_after_seconds', lock_seconds
  );
end;
$$;

create or replace function public.v4_pin_validate_session(p_session_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.v4_pin_sessions;
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

  update public.v4_pin_sessions set last_seen_at = p_now where id = session_row.id;
  return jsonb_build_object('ok', true, 'expires_at', session_row.expires_at);
end;
$$;

create or replace function public.v4_pin_revoke_session(p_session_hash text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.v4_pin_sessions
  set revoked_at = now()
  where token_hash = p_session_hash and revoked_at is null;
$$;

revoke all on function public.v4_pin_login_attempt(text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.v4_pin_validate_session(text, timestamptz) from public, anon, authenticated;
revoke all on function public.v4_pin_revoke_session(text) from public, anon, authenticated;

grant execute on function public.v4_pin_login_attempt(text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.v4_pin_validate_session(text, timestamptz) to service_role;
grant execute on function public.v4_pin_revoke_session(text) to service_role;

alter table public.message_outbox alter column actor_id drop not null;
