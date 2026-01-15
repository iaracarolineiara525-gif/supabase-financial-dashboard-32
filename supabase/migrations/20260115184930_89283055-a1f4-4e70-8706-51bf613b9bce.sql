-- Create companies table
CREATE TABLE public.companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    cnpj text NOT NULL UNIQUE,
    state text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read companies" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Allow public insert companies" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update companies" ON public.companies FOR UPDATE USING (true);
CREATE POLICY "Allow public delete companies" ON public.companies FOR DELETE USING (true);

-- Insert the two companies
INSERT INTO public.companies (name, cnpj, state) VALUES 
    ('GPN DIGITAL MARKETING LTDA', '64.267.179/0001-20', 'SP'),
    ('GPN DIGITAL LTDA', '58.533.819/0001-02', 'RS');

-- Add company_id to clients table (nullable first, then set default)
ALTER TABLE public.clients ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Set all existing clients to SP company
UPDATE public.clients SET company_id = (SELECT id FROM public.companies WHERE state = 'SP');

-- Add company_id to employees table
ALTER TABLE public.employees ADD COLUMN company_id uuid REFERENCES public.companies(id);
UPDATE public.employees SET company_id = (SELECT id FROM public.companies WHERE state = 'SP');

-- Add company_id to fixed_bills table
ALTER TABLE public.fixed_bills ADD COLUMN company_id uuid REFERENCES public.companies(id);
UPDATE public.fixed_bills SET company_id = (SELECT id FROM public.companies WHERE state = 'SP');

-- Create trigger for updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();