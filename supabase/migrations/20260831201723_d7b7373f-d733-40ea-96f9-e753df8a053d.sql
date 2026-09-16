CREATE TABLE public.automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active','paused','archived')),
  operator_key text,
  list_id uuid REFERENCES public.message_lists(id) ON DELETE SET NULL,
  list_name text,
  api_channel text NOT NULL DEFAULT 'whatsapp_cloud_api',
  max_steps integer NOT NULL DEFAULT 10 CHECK (max_steps BETWEEN 1 AND 50),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order >= 1),
  branch text NOT NULL DEFAULT 'main' CHECK (branch IN ('main','responded','no_response')),
  title text,
  message_body text,
  template_name text,
  template_language text NOT NULL DEFAULT 'pt_BR',
  template_parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
  wait_days integer NOT NULL DEFAULT 3 CHECK (wait_days BETWEEN 0 AND 365),
  wait_hours integer NOT NULL DEFAULT 0 CHECK (wait_hours BETWEEN 0 AND 23),
  wait_minutes integer NOT NULL DEFAULT 0 CHECK (wait_minutes BETWEEN 0 AND 59),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, step_order, branch)
);

CREATE TABLE public.automation_flow_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.message_contacts(id) ON DELETE SET NULL,
  phone_e164 text NOT NULL,
  contact_name text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','responded','no_response','next_step','paused','completed','error')),
  current_step_order integer NOT NULL DEFAULT 1,
  current_branch text NOT NULL DEFAULT 'main' CHECK (current_branch IN ('main','responded','no_response')),
  last_step_id uuid REFERENCES public.automation_steps(id) ON DELETE SET NULL,
  last_message_preview text,
  last_message_at timestamptz,
  last_response_at timestamptz,
  last_response_preview text,
  next_action text,
  next_run_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, phone_e164)
);

CREATE TABLE public.automation_contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_contact_id uuid NOT NULL REFERENCES public.automation_flow_contacts(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  step_order integer,
  branch text,
  event_type text NOT NULL,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX automation_steps_flow_idx ON public.automation_steps (flow_id, step_order, branch);
CREATE INDEX automation_flow_contacts_due_idx ON public.automation_flow_contacts (next_run_at) WHERE status IN ('waiting','next_step','responded','no_response');
CREATE INDEX automation_flow_contacts_phone_idx ON public.automation_flow_contacts (phone_e164);
CREATE INDEX automation_contact_events_contact_idx ON public.automation_contact_events (flow_contact_id, created_at DESC);

GRANT ALL ON public.automation_flows TO service_role;
GRANT ALL ON public.automation_steps TO service_role;
GRANT ALL ON public.automation_flow_contacts TO service_role;
GRANT ALL ON public.automation_contact_events TO service_role;

ALTER TABLE public.automation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_flow_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_contact_events ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_automation_flows_updated_at BEFORE UPDATE ON public.automation_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_automation_steps_updated_at BEFORE UPDATE ON public.automation_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_automation_flow_contacts_updated_at BEFORE UPDATE ON public.automation_flow_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.automation_register_response(p_phone_e164 text, p_preview text, p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  affected integer := 0;
  digits text := regexp_replace(coalesce(p_phone_e164, ''), '[^0-9]', '', 'g');
begin
  if length(digits) < 8 then
    return 0;
  end if;

  update public.automation_flow_contacts fc
  set status = 'responded',
      last_response_at = p_now,
      last_response_preview = left(coalesce(p_preview, '[resposta]'), 240),
      next_action = 'Avançar para a próxima etapa (respondeu)',
      next_run_at = least(coalesce(fc.next_run_at, p_now), p_now),
      updated_at = p_now
  where regexp_replace(fc.phone_e164, '[^0-9]', '', 'g') = digits
    and fc.status in ('waiting','no_response','next_step');

  get diagnostics affected = row_count;

  insert into public.automation_contact_events (flow_contact_id, flow_id, step_order, branch, event_type, detail)
  select fc.id, fc.flow_id, fc.current_step_order, fc.current_branch, 'response_received', left(coalesce(p_preview, '[resposta]'), 240)
  from public.automation_flow_contacts fc
  where regexp_replace(fc.phone_e164, '[^0-9]', '', 'g') = digits
    and fc.last_response_at = p_now;

  return affected;
end;
$$;