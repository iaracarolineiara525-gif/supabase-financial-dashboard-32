create table if not exists public.v4_password_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  verification_token_hash text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists v4_password_recovery_email_idx on public.v4_password_recovery_codes(email, created_at desc);
create index if not exists v4_password_recovery_token_idx on public.v4_password_recovery_codes(verification_token_hash);

alter table public.v4_password_recovery_codes enable row level security;

-- Os códigos, hashes e tokens são acessados somente pelas Edge Functions com service role.

create or replace function public.v4_verify_password_code(p_email text, p_code_hash text, p_max_attempts integer default 5)
returns table(valid boolean, recovery_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.v4_password_recovery_codes;
begin
  select * into candidate
  from public.v4_password_recovery_codes
  where email = lower(p_email)
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if candidate.id is null or candidate.attempts >= coalesce(p_max_attempts, 5) then
    return query select false, null::uuid;
    return;
  end if;

  if candidate.code_hash <> p_code_hash then
    update public.v4_password_recovery_codes set attempts = attempts + 1 where id = candidate.id;
    return query select false, candidate.id;
    return;
  end if;

  update public.v4_password_recovery_codes set verified_at = now() where id = candidate.id;
  return query select true, candidate.id;
end;
$$;

revoke all on function public.v4_verify_password_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.v4_verify_password_code(text, text, integer) to service_role;
