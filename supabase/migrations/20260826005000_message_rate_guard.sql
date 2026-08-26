
create table if not exists public.message_send_rate_windows (
  operator_key text not null,
  bucket_start timestamptz not null,
  sent_count integer not null default 0 check (sent_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (operator_key, bucket_start)
);

alter table public.message_send_rate_windows enable row level security;

create or replace function public.v4_claim_send_slot(
  p_operator_key text,
  p_limit integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket timestamptz := date_trunc('minute', p_now);
  current_count integer;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  if p_operator_key is null or length(trim(p_operator_key)) = 0 then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_operator');
  end if;

  insert into public.message_send_rate_windows(operator_key, bucket_start, sent_count, updated_at)
  values (p_operator_key, bucket, 1, p_now)
  on conflict (operator_key, bucket_start) do update
    set sent_count = public.message_send_rate_windows.sent_count + 1,
        updated_at = excluded.updated_at
  returning sent_count into current_count;

  if current_count > safe_limit then
    update public.message_send_rate_windows
    set sent_count = greatest(0, sent_count - 1), updated_at = p_now
    where operator_key = p_operator_key and bucket_start = bucket;
    return jsonb_build_object('ok', false, 'error_code', 'rate_limited', 'retry_after_seconds', 60 - extract(second from p_now)::integer);
  end if;

  return jsonb_build_object('ok', true, 'sent_count', current_count, 'limit', safe_limit);
end;
$$;

revoke all on function public.v4_claim_send_slot(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.v4_claim_send_slot(text, integer, timestamptz) to service_role;
