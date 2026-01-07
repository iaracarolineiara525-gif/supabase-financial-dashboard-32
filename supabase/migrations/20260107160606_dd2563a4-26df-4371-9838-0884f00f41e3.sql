-- Create table for fixed bills/expenses
CREATE TABLE public.fixed_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  total_value NUMERIC NOT NULL DEFAULT 0,
  total_installments INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for fixed bill installments
CREATE TABLE public.fixed_bill_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fixed_bill_id UUID NOT NULL REFERENCES public.fixed_bills(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  value NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fixed_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_bill_installments ENABLE ROW LEVEL SECURITY;

-- RLS policies for fixed_bills
CREATE POLICY "Allow public read fixed_bills" ON public.fixed_bills FOR SELECT USING (true);
CREATE POLICY "Allow public insert fixed_bills" ON public.fixed_bills FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update fixed_bills" ON public.fixed_bills FOR UPDATE USING (true);
CREATE POLICY "Allow public delete fixed_bills" ON public.fixed_bills FOR DELETE USING (true);

-- RLS policies for fixed_bill_installments
CREATE POLICY "Allow public read fixed_bill_installments" ON public.fixed_bill_installments FOR SELECT USING (true);
CREATE POLICY "Allow public insert fixed_bill_installments" ON public.fixed_bill_installments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update fixed_bill_installments" ON public.fixed_bill_installments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete fixed_bill_installments" ON public.fixed_bill_installments FOR DELETE USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_fixed_bills_updated_at
  BEFORE UPDATE ON public.fixed_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fixed_bill_installments_updated_at
  BEFORE UPDATE ON public.fixed_bill_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();