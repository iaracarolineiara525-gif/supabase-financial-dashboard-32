CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    document text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    installment_id uuid,
    amount numeric NOT NULL,
    percentage numeric,
    commission_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_date date,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    description text,
    total_value numeric(15,2) DEFAULT 0 NOT NULL,
    start_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_date date NOT NULL,
    payment_type text DEFAULT 'salary'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text,
    email text,
    phone text,
    salary numeric DEFAULT 0,
    hire_date date DEFAULT CURRENT_DATE NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_id uuid NOT NULL,
    installment_number integer NOT NULL,
    total_installments integer NOT NULL,
    value numeric(15,2) NOT NULL,
    due_date date NOT NULL,
    paid_date date,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT installments_status_check CHECK ((status = ANY (ARRAY['open'::text, 'paid'::text, 'overdue'::text])))
);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: employee_payments employee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_payments
    ADD CONSTRAINT employee_payments_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: installments installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installments
    ADD CONSTRAINT installments_pkey PRIMARY KEY (id);


--
-- Name: idx_contracts_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_client_id ON public.contracts USING btree (client_id);


--
-- Name: idx_installments_contract_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_contract_id ON public.installments USING btree (contract_id);


--
-- Name: idx_installments_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_due_date ON public.installments USING btree (due_date);


--
-- Name: idx_installments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_installments_status ON public.installments USING btree (status);


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: commissions update_commissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contracts update_contracts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employee_payments update_employee_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employee_payments_updated_at BEFORE UPDATE ON public.employee_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: installments update_installments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_installments_updated_at BEFORE UPDATE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: commissions commissions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_installment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES public.installments(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: employee_payments employee_payments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_payments
    ADD CONSTRAINT employee_payments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: installments installments_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.installments
    ADD CONSTRAINT installments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;


--
-- Name: clients Allow public delete clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete clients" ON public.clients FOR DELETE USING (true);


--
-- Name: commissions Allow public delete commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete commissions" ON public.commissions FOR DELETE USING (true);


--
-- Name: contracts Allow public delete contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete contracts" ON public.contracts FOR DELETE USING (true);


--
-- Name: employee_payments Allow public delete employee_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete employee_payments" ON public.employee_payments FOR DELETE USING (true);


--
-- Name: employees Allow public delete employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete employees" ON public.employees FOR DELETE USING (true);


--
-- Name: installments Allow public delete installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public delete installments" ON public.installments FOR DELETE USING (true);


--
-- Name: clients Allow public insert clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert clients" ON public.clients FOR INSERT WITH CHECK (true);


--
-- Name: commissions Allow public insert commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert commissions" ON public.commissions FOR INSERT WITH CHECK (true);


--
-- Name: contracts Allow public insert contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert contracts" ON public.contracts FOR INSERT WITH CHECK (true);


--
-- Name: employee_payments Allow public insert employee_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert employee_payments" ON public.employee_payments FOR INSERT WITH CHECK (true);


--
-- Name: employees Allow public insert employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert employees" ON public.employees FOR INSERT WITH CHECK (true);


--
-- Name: installments Allow public insert installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public insert installments" ON public.installments FOR INSERT WITH CHECK (true);


--
-- Name: clients Allow public read clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read clients" ON public.clients FOR SELECT USING (true);


--
-- Name: commissions Allow public read commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read commissions" ON public.commissions FOR SELECT USING (true);


--
-- Name: contracts Allow public read contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read contracts" ON public.contracts FOR SELECT USING (true);


--
-- Name: employee_payments Allow public read employee_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read employee_payments" ON public.employee_payments FOR SELECT USING (true);


--
-- Name: employees Allow public read employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read employees" ON public.employees FOR SELECT USING (true);


--
-- Name: installments Allow public read installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read installments" ON public.installments FOR SELECT USING (true);


--
-- Name: clients Allow public update clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update clients" ON public.clients FOR UPDATE USING (true);


--
-- Name: commissions Allow public update commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update commissions" ON public.commissions FOR UPDATE USING (true);


--
-- Name: contracts Allow public update contracts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update contracts" ON public.contracts FOR UPDATE USING (true);


--
-- Name: employee_payments Allow public update employee_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update employee_payments" ON public.employee_payments FOR UPDATE USING (true);


--
-- Name: employees Allow public update employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update employees" ON public.employees FOR UPDATE USING (true);


--
-- Name: installments Allow public update installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public update installments" ON public.installments FOR UPDATE USING (true);


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


